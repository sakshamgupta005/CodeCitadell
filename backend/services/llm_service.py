from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import requests

from models.schemas import SearchResultItem
from services.config import get_settings
from services.exceptions import ConfigurationError, ExternalServiceError


logger = logging.getLogger(__name__)

NO_EVIDENCE_ANSWER = "I could not find evidence in the indexed product knowledge."


class LLMService:
    def __init__(self) -> None:
        self._session = requests.Session()

    async def answer_from_context(self, query: str, documents: list[SearchResultItem]) -> str:
        if not documents:
            return NO_EVIDENCE_ANSWER

        settings = get_settings()
        prompt = self._build_prompt(query=query, documents=documents)
        logger.info("Generating answer with Gemini model %s", settings.gemini_model)

        answer = await self._generate_text(instructions=self._instructions(), prompt=prompt)
        return answer.strip() or NO_EVIDENCE_ANSWER

    async def diagnose_product_issue(
        self,
        product_name: str,
        issue_description: str,
        documents: list[SearchResultItem],
        diagnostic_history: list[dict[str, str]],
    ) -> dict[str, Any]:
        prompt = self._build_diagnostic_prompt(
            product_name=product_name,
            issue_description=issue_description,
            documents=documents,
            diagnostic_history=diagnostic_history,
        )
        answer = await self._generate_text(
            instructions=self._diagnostic_instructions(),
            prompt=prompt,
            temperature=0.2,
        )
        parsed = self._parse_json_object(answer)
        if parsed is None:
            logger.warning("Gemini diagnostic response was not valid JSON; using fallback parser")
            return {
                "probable_causes": ["Insufficient documentation evidence."],
                "investigation_reasoning": answer.strip() or "No diagnostic details could be generated from context.",
                "follow_up_question": "What exact behavior do you observe right before the issue happens?",
                "next_step": "Collect one more symptom and compare it against the referenced documentation.",
                "recommended_action": "Review the retrieved product documentation before taking corrective action.",
                "cited_sources": None,
            }

        return {
            "probable_causes": self._string_list(parsed.get("probable_causes")),
            "investigation_reasoning": str(parsed.get("investigation_reasoning") or "").strip()
            or "Based on the symptom, we need to inspect the connection and physical indicators.",
            "follow_up_question": str(parsed.get("follow_up_question") or "").strip()
            or "What exact behavior do you observe right before the issue happens?",
            "next_step": str(parsed.get("next_step") or "").strip()
            or "Collect one more symptom and compare it against the referenced documentation.",
            "recommended_action": str(parsed.get("recommended_action") or "").strip()
            or "Review the retrieved product documentation before taking corrective action.",
            "cited_sources": parsed.get("cited_sources") if isinstance(parsed.get("cited_sources"), list) else None,
        }

    async def diagnose_global_issue(
        self,
        issue_description: str,
        documents: list[SearchResultItem],
    ) -> dict[str, Any]:
        prompt = f"User issue description: {issue_description}\n\nRetrieved context:\n"
        for idx, doc in enumerate(documents, start=1):
            metadata = doc.metadata
            prompt += (
                f"[Source {idx}]\n"
                f"id: {doc.id}\n"
                f"product_id: {metadata.get('product_id', '')}\n"
                f"product_name: {metadata.get('product_name', '')}\n"
                f"title: {metadata.get('title', '')}\n"
                f"text:\n{doc.text}\n---\n"
            )

        instructions = (
            "You are a global support router and diagnostic assistant. Analyze the user's issue and search the retrieved "
            "context to identify which product they are asking about.\n"
            "First, determine if the question is educational/conceptual (e.g., 'What is Moss?', 'How does mesh networking work?').\n"
            "If it is educational/conceptual:\n"
            "  - Set 'detected_product_id' and 'detected_product_name' to the matching product, or null if it spans multiple products.\n"
            "  - Set 'investigation_reasoning' to a friendly, comprehensive explanation of the concept based on the retrieved documentation.\n"
            "  - Set 'probable_causes' to an empty list [].\n"
            "  - Set 'follow_up_question' to a clarifying question asking if they want to learn more details or troubleshoot a specific issue.\n"
            "  - Set 'next_step' to 'Conceptual routing'.\n"
            "  - Set 'recommended_action' to 'Learn more from the documentation'.\n"
            "If it is a diagnostic problem (e.g., node won't connect, jammed printer):\n"
            "  - Set 'detected_product_id' to the product_id of the matching product, or null if none match.\n"
            "  - Set 'detected_product_name' to the name of the matching product, or null if none match.\n"
            "  - Set 'investigation_reasoning' to a paragraph of 2-3 sentences explaining which product matches the symptom and why.\n"
            "  - Set 'probable_causes' to likely causes.\n"
            "  - Set 'follow_up_question' to a targeted clarifying question.\n"
            "  - Set 'next_step' to a step description.\n"
            "  - Set 'recommended_action' to 'Click Select to open the diagnostic assistant for this product'.\n\n"
            "You MUST return a single, valid JSON object with these keys. Do not wrap the JSON in markdown code blocks. Do not add any text before or after the JSON."
        )

        answer = await self._generate_text(
            instructions=instructions,
            prompt=prompt,
            temperature=0.2,
        )
        parsed = self._parse_json_object(answer)
        if parsed is None:
            return {
                "detected_product_id": None,
                "detected_product_name": None,
                "investigation_reasoning": "We need to clarify which device is experiencing the problem.",
                "probable_causes": ["Unknown Product"],
                "follow_up_question": "Which of our products are you referring to?",
                "next_step": "Identify product",
                "recommended_action": "Select a product from the list to begin specific diagnostics.",
                "cited_sources": None,
            }

        return {
            "detected_product_id": parsed.get("detected_product_id") or None,
            "detected_product_name": parsed.get("detected_product_name") or None,
            "investigation_reasoning": str(parsed.get("investigation_reasoning") or "").strip(),
            "probable_causes": self._string_list(parsed.get("probable_causes")),
            "follow_up_question": str(parsed.get("follow_up_question") or "").strip(),
            "next_step": str(parsed.get("next_step") or "").strip(),
            "recommended_action": str(parsed.get("recommended_action") or "").strip(),
            "cited_sources": parsed.get("cited_sources") if isinstance(parsed.get("cited_sources"), list) else None,
        }

    async def _generate_text(self, instructions: str, prompt: str, temperature: float = 0.1) -> str:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ConfigurationError("GEMINI_API_KEY must be set.")

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent"
        )
        payload = {
            "systemInstruction": {"parts": [{"text": instructions}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature},
        }
        params = {"key": settings.gemini_api_key}

        try:
            response = await asyncio.to_thread(
                self._session.post,
                url,
                params=params,
                json=payload,
                timeout=settings.gemini_timeout_seconds,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            detail = getattr(exc.response, "text", "") if getattr(exc, "response", None) else ""
            message = f"Gemini request failed: {exc}"
            if detail:
                message = f"{message}. {detail[:500]}"
            raise ExternalServiceError(message) from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise ExternalServiceError("Gemini returned a non-JSON response.") from exc

        candidates = data.get("candidates") or [{}]
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(str(part.get("text", "")) for part in parts)
        return text.strip()

    @staticmethod
    def _instructions() -> str:
        return (
            "You are a product support knowledge assistant. "
            "Answer strictly and only from the retrieved context supplied by the user. "
            f"If the context does not contain enough evidence, answer exactly: {NO_EVIDENCE_ANSWER} "
            "Do not use outside knowledge. Keep answers concise and cite evidence with source labels like [Source 1]."
        )

    @staticmethod
    def _diagnostic_instructions() -> str:
        return (
            "You are a professional product support hardware engineer, educator, and diagnostic assistant.\n"
            "Analyze the user's input and classify the intent into one of the following:\n"
            "1. Educational/Conceptual/General (e.g., 'What is Moss?', 'What is mesh networking?', 'How does it work?'):\n"
            "   - Set 'probable_causes' to an empty list [].\n"
            "   - Set 'investigation_reasoning' to a friendly, natural, and comprehensive explanation of the concept or product, based strictly on the retrieved documentation.\n"
            "   - Set 'follow_up_question' to a helpful follow-up question related to the concept or asking if they have a diagnostic problem.\n"
            "   - Set 'next_step' to 'Conceptual inquiry'.\n"
            "   - Set 'recommended_action' to 'Learn more from the documentation'.\n"
            "2. Diagnostic/Troubleshooting (e.g., 'My mesh node won't connect', 'LaserJet has a paper jam'):\n"
            "   - Set 'probable_causes' to a list of 2-4 short strings representing the most likely causes based on documentation.\n"
            "   - Set 'investigation_reasoning' to a paragraph of 2-3 sentences explaining your diagnostic thought process, referencing specific guides and findings to explain why you are narrowing down or suspecting these causes, without guessing prematurely.\n"
            "   - Set 'follow_up_question' to a targeted clarifying question (e.g., status lights, symptom behavior, or physical state).\n"
            "   - Set 'next_step' to the next physical check the user should perform.\n"
            "   - Set 'recommended_action' to a specific check or fix from the documentation.\n\n"
            "You MUST return a single, valid JSON object with the keys 'probable_causes', 'investigation_reasoning', 'follow_up_question', 'next_step', and 'recommended_action'.\n"
            "Ensure the output starts with '{' and ends with '}'. Do not wrap the JSON in markdown code blocks. Do not add any text before or after the JSON."
        )

    @staticmethod
    def _build_prompt(query: str, documents: list[SearchResultItem]) -> str:
        max_context_chars = get_settings().max_context_chars
        sections: list[str] = []
        used_chars = 0

        for index, document in enumerate(documents, start=1):
            metadata = document.metadata
            section = (
                f"[Source {index}]\n"
                f"id: {document.id}\n"
                f"source: {metadata.get('source', '')}\n"
                f"type: {metadata.get('type', '')}\n"
                f"product_id: {metadata.get('product_id', '')}\n"
                f"product_name: {metadata.get('product_name', '')}\n"
                f"product_category: {metadata.get('product_category', '')}\n"
                f"repo: {metadata.get('repo', '')}\n"
                f"url: {metadata.get('url', '')}\n"
                f"created_at: {metadata.get('created_at', '')}\n"
                f"text:\n{document.text}\n"
            )
            if used_chars + len(section) > max_context_chars:
                remaining = max_context_chars - used_chars
                if remaining > 500:
                    sections.append(section[:remaining])
                break
            sections.append(section)
            used_chars += len(section)

        context = "\n---\n".join(sections)
        return f"Question: {query}\n\nRetrieved context:\n{context}"

    @staticmethod
    def _build_diagnostic_prompt(
        product_name: str,
        issue_description: str,
        documents: list[SearchResultItem],
        diagnostic_history: list[dict[str, str]],
    ) -> str:
        max_context_chars = get_settings().max_context_chars
        sections: list[str] = []
        used_chars = 0

        for index, document in enumerate(documents, start=1):
            metadata = document.metadata
            section = (
                f"[Source {index}]\n"
                f"id: {document.id}\n"
                f"title: {metadata.get('title', '')}\n"
                f"type: {metadata.get('type', '')}\n"
                f"url: {metadata.get('url', '')}\n"
                f"text:\n{document.text}\n"
            )
            if used_chars + len(section) > max_context_chars:
                remaining = max_context_chars - used_chars
                if remaining > 500:
                    sections.append(section[:remaining])
                break
            sections.append(section)
            used_chars += len(section)

        history_lines = []
        for item in diagnostic_history:
            question = item.get("question", "").strip()
            answer = item.get("answer", "").strip()
            if question or answer:
                history_lines.append(f"Question: {question}\nAnswer: {answer}")

        context = "\n---\n".join(sections) if sections else "No product documentation was retrieved."
        history = "\n\n".join(history_lines) if history_lines else "No prior diagnostic answers."
        return (
            f"Product: {product_name}\n"
            f"Issue description: {issue_description}\n\n"
            f"Diagnostic history:\n{history}\n\n"
            f"Retrieved documentation:\n{context}"
        )

    @staticmethod
    def _parse_json_object(text: str) -> dict[str, Any] | None:
        stripped = text.strip()
        if stripped.startswith("```"):
            stripped = re.sub(r"^```(?:json)?", "", stripped, flags=re.IGNORECASE).strip()
            stripped = re.sub(r"```$", "", stripped).strip()
        match = re.search(r"\{.*\}", stripped, flags=re.DOTALL)
        if match:
            stripped = match.group(0)
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

    @staticmethod
    def _string_list(value: Any) -> list[str]:
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return cleaned or ["Insufficient documentation evidence."]
        if value:
            return [str(value).strip()]
        return ["Insufficient documentation evidence."]
