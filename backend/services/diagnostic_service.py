from __future__ import annotations

from models.schemas import DiagnosticReference, DiagnosticRequest, DiagnosticResponse, Product, SearchResultItem
from services.exceptions import InputValidationError
from services.llm_service import LLMService
from services.moss_service import MossService
from services.product_store import ProductStore, product_store


class DiagnosticService:
    def __init__(
        self,
        store: ProductStore | None = None,
        moss_service: MossService | None = None,
        llm_service: LLMService | None = None,
    ) -> None:
        self.store = store or product_store
        self.moss_service = moss_service or MossService()
        self.llm_service = llm_service or LLMService()

    async def diagnose(self, product: Product, payload: DiagnosticRequest) -> DiagnosticResponse:
        session = self._get_or_create_session(product=product, payload=payload)
        if payload.answer:
            session = self.store.add_diagnostic_answer(str(session["id"]), payload.answer)

        issue_description = str(session.get("issue_description") or "").strip()
        if payload.issue_description and not issue_description:
            issue_description = payload.issue_description.strip()
        if not issue_description:
            raise InputValidationError("issue_description is required for a new diagnostic session.")

        history = self._history(session)
        documents = await self._retrieve_product_documents(
            product=product,
            issue_description=issue_description,
            history=history,
            top_k=payload.top_k,
        )

        if not documents:
            latest_question = "No supporting documentation was found in Moss for this product issue."
            next_step = "No supporting documentation found in Moss."
            recommended_action = "Please upload product manuals or support guides to index them into the Moss knowledge base."
            self.store.update_diagnostic_session(
                session_id=str(session["id"]),
                probable_causes=[],
                latest_question=latest_question,
                next_step=next_step,
                recommended_action=recommended_action,
            )
            return DiagnosticResponse(
                session_id=str(session["id"]),
                probable_causes=[],
                follow_up_question=latest_question,
                next_step=next_step,
                recommended_action=recommended_action,
                documentation_references=[],
            )

        diagnosis = await self.llm_service.diagnose_product_issue(
            product_name=product.name,
            issue_description=issue_description,
            documents=documents,
            diagnostic_history=history,
        )

        self.store.update_diagnostic_session(
            session_id=str(session["id"]),
            probable_causes=diagnosis["probable_causes"],
            latest_question=diagnosis["follow_up_question"],
            next_step=diagnosis["next_step"],
            recommended_action=diagnosis["recommended_action"],
        )

        return DiagnosticResponse(
            session_id=str(session["id"]),
            probable_causes=diagnosis["probable_causes"],
            follow_up_question=diagnosis["follow_up_question"],
            next_step=diagnosis["next_step"],
            recommended_action=diagnosis["recommended_action"],
            documentation_references=self._references(documents),
        )

    def _get_or_create_session(self, product: Product, payload: DiagnosticRequest) -> dict[str, object]:
        if payload.session_id:
            session = self.store.get_diagnostic_session(payload.session_id)
            if session.get("product_id") != product.id:
                raise InputValidationError("Diagnostic session does not belong to this product.")
            return session

        if not payload.issue_description:
            raise InputValidationError("issue_description is required for a new diagnostic session.")
        return self.store.create_diagnostic_session(
            product_id=product.id,
            issue_description=payload.issue_description,
        )

    async def _retrieve_product_documents(
        self,
        product: Product,
        issue_description: str,
        history: list[dict[str, str]],
        top_k: int,
    ) -> list[SearchResultItem]:
        answer_text = " ".join(item["answer"] for item in history if item.get("answer"))
        query = f"{product.id} {product.name} {product.category} {issue_description} {answer_text}".strip()
        raw_results = await self.moss_service.search_documents(query=query, top_k=min(25, max(top_k * 3, top_k)))
        product_results = [
            result
            for result in raw_results
            if result.metadata.get("product_id") == product.id
            and result.metadata.get("source") == "product_knowledge"
        ]
        return product_results[:top_k]

    @staticmethod
    def _history(session: dict[str, object]) -> list[dict[str, str]]:
        answers = session.get("answers") or []
        if not isinstance(answers, list):
            return []
        history = []
        for item in answers:
            if isinstance(item, dict):
                history.append(
                    {
                        "question": str(item.get("question") or ""),
                        "answer": str(item.get("answer") or ""),
                    }
                )
        return history

    @staticmethod
    def _references(documents: list[SearchResultItem]) -> list[DiagnosticReference]:
        references = []
        for document in documents:
            metadata = document.metadata
            snippet = document.text[:240].replace("\n", " ").strip()
            references.append(
                DiagnosticReference(
                    source=metadata.get("source", ""),
                    type=metadata.get("type", ""),
                    id=document.id,
                    title=metadata.get("title"),
                    url=metadata.get("url"),
                    score=document.score,
                    snippet=snippet,
                )
            )
        return references


diagnostic_service = DiagnosticService()
