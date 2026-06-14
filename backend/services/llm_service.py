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
                "probable_causes": [answer.strip() or "Insufficient documentation evidence."],
                "follow_up_question": "What exact behavior do you observe right before the issue happens?",
                "next_step": "Collect one more symptom and compare it against the referenced documentation.",
                "recommended_action": "Review the retrieved product documentation before taking corrective action.",
            }

        return {
            "probable_causes": self._string_list(parsed.get("probable_causes")),
            "follow_up_question": str(parsed.get("follow_up_question") or "").strip()
            or "What exact behavior do you observe right before the issue happens?",
            "next_step": str(parsed.get("next_step") or "").strip()
            or "Collect one more symptom and compare it against the referenced documentation.",
            "recommended_action": str(parsed.get("recommended_action") or "").strip()
            or "Review the retrieved product documentation before taking corrective action.",
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
            "You are a product diagnostic assistant. Use only the retrieved product documentation and "
            "the diagnostic session history. You MUST return a single, valid JSON object with the following keys:\n"
            '- "probable_causes": a list of short strings indicating the most likely causes of the issue\n'
            '- "follow_up_question": a single clarifying question to narrow down the cause\n'
            '- "next_step": a short description of the next troubleshooting step\n'
            '- "recommended_action": a recommended action for the user to resolve the issue\n'
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
