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
        image_data: str | None = None,
        image_mime_type: str | None = None,
    ) -> dict[str, Any]:
        prompt = self._build_diagnostic_prompt(
            product_name=product_name,
            issue_description=issue_description,
            documents=documents,
            diagnostic_history=diagnostic_history,
            image_attached=bool(image_data),
        )
        answer = await self._generate_text(
            instructions=self._diagnostic_instructions(),
            prompt=prompt,
            temperature=0.2,
            image_data=image_data,
            image_mime_type=image_mime_type,
        )
        parsed = self._parse_json_object(answer)
        if parsed is None:
            logger.warning("Gemini diagnostic response was not valid JSON; using fallback parser")
            return {
                "probable_causes": ["Insufficient documentation evidence."],
                "possible_causes": [
                    {
                        "cause": "Insufficient documentation evidence.",
                        "probability": 0.0,
                        "status": "possible",
                        "evidence": "The LLM did not return structured diagnostic evidence.",
                        "source": None,
                        "elimination_reason": None,
                    }
                ],
                "eliminated_causes": [],
                "most_likely_cause": "Insufficient information",
                "confidence": "low",
                "visual_analysis": self._visual_analysis(parsed=None, image_attached=bool(image_data)),
                "investigation_reasoning": answer.strip() or "No diagnostic details could be generated from context.",
                "follow_up_question": "What exact behavior do you observe right before the issue happens?",
                "next_step": "Collect one more symptom and compare it against the referenced documentation.",
                "recommended_action": "Review the retrieved product documentation before taking corrective action.",
                "cited_sources": None,
                "spare_parts": [],
            }

        possible_causes = self._cause_list(parsed.get("possible_causes"), parsed.get("probable_causes"))
        eliminated_causes = self._cause_list(parsed.get("eliminated_causes"), None, default_status="eliminated")
        probable_causes = [cause["cause"] for cause in possible_causes if cause["cause"]]
        if not probable_causes:
            probable_causes = self._string_list(parsed.get("probable_causes"), default=[])

        return {
            "probable_causes": probable_causes,
            "possible_causes": possible_causes,
            "eliminated_causes": eliminated_causes,
            "most_likely_cause": str(parsed.get("most_likely_cause") or (probable_causes[0] if probable_causes else "")).strip()
            or "Insufficient information",
            "confidence": self._confidence(parsed.get("confidence")),
            "visual_analysis": self._visual_analysis(parsed.get("visual_analysis"), image_attached=bool(image_data)),
            "investigation_reasoning": str(parsed.get("investigation_reasoning") or "").strip()
            or "Based on the symptom, we need to inspect the connection and physical indicators.",
            "follow_up_question": str(parsed.get("follow_up_question") or "").strip()
            or str(parsed.get("next_question") or "").strip()
            or "What exact behavior do you observe right before the issue happens?",
            "next_step": str(parsed.get("next_step") or "").strip()
            or "Collect one more symptom and compare it against the referenced documentation.",
            "recommended_action": str(parsed.get("recommended_action") or "").strip()
            or "Review the retrieved product documentation before taking corrective action.",
            "cited_sources": parsed.get("cited_sources") if isinstance(parsed.get("cited_sources"), list) else None,
            "spare_parts": self._parse_spare_parts(parsed.get("spare_parts"), documents),
        }

    async def diagnose_global_issue(
        self,
        issue_description: str,
        documents: list[SearchResultItem],
        image_data: str | None = None,
        image_mime_type: str | None = None,
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
                f"page: {metadata.get('page', '')}\n"
                f"section: {metadata.get('section', '')}\n"
                f"text:\n{doc.text}\n---\n"
            )
        if image_data:
            prompt += "\nA user-uploaded diagnostic photo is attached. Analyze only visible details in that image.\n"

        instructions = (
            "You are an expert product diagnostic technician. Your role is NOT to act as a chatbot, search engine, FAQ bot, "
            "or generic document retriever. You must behave like an experienced mechanic, service engineer, field technician, "
            "or repair specialist.\n"
            "Analyze the user's issue and search the retrieved context to identify which product they are asking about.\n"
            "First, determine if the question is educational/conceptual (e.g., 'What is Moss?', 'How does mesh networking work?').\n"
            "If it is educational/conceptual:\n"
            "  - Set 'detected_product_id' and 'detected_product_name' to the matching product, or null if it spans multiple products.\n"
            "  - Set 'investigation_reasoning' to a friendly, natural, direct, and comprehensive explanation of the concept based on the retrieved documentation. Address the user directly in the second person. Do NOT write in the third-person or use robotic reasoning.\n"
            "  - Set 'probable_causes' to an empty list [].\n"
            "  - Set 'possible_causes' and 'eliminated_causes' to empty lists [].\n"
            "  - Set 'most_likely_cause' to null and 'confidence' to 'low'.\n"
            "  - If an image is attached, set 'visual_analysis' by listing visible items only; do not infer hidden damage.\n"
            "  - Set 'follow_up_question' to a clarifying question asking if they want to learn more details or troubleshoot a specific issue.\n"
            "  - Set 'next_step' to 'Conceptual routing'.\n"
            "  - Set 'recommended_action' using this format: Recommendation: ...\\n\\nEvidence: ...\\n\\nSource:\\nDocument Name\\nPage Number\\nSection Heading. If documentation does not support a claim, say so explicitly.\n"
            "  - Set 'cited_sources' to a list of 1-based indices of the retrieved sources actually used for this explanation (e.g. [1, 2] or []).\n"
            "  - Set 'spare_parts' to a list of recommended spare parts if the documentation explicitly supports their replacement for this inquiry, otherwise set it to [].\n"
            "If it is a diagnostic problem (e.g., node won't connect, jammed printer):\n"
            "  - When a user reports an issue, follow this systematic approach:\n"
            "    1. Understand the symptoms.\n"
            "    2. Gather context.\n"
            "    3. Identify possible causes.\n"
            "    4. Ask targeted follow-up questions.\n"
            "    5. Eliminate unlikely causes.\n"
            "    6. Narrow down the most probable root cause.\n"
            "    7. Recommend safe inspection steps.\n"
            "    8. Recommend corrective actions.\n"
            "    9. Support conclusions using official product documentation.\n"
            "  - Follow these strict rules:\n"
            "    * Never immediately provide a diagnosis when information is insufficient.\n"
            "    * Ask one high-value diagnostic question at a time.\n"
            "    * Use a process-of-elimination approach.\n"
            "    * Avoid overwhelming the user with many questions at once.\n"
            "    * Prioritize user safety.\n"
            "    * Never suggest unsafe procedures.\n"
            "    * Clearly state when professional service is required.\n"
            "    * Cite supporting documentation whenever available.\n"
            "    * Distinguish between confirmed facts and assumptions.\n"
            "  - Set 'detected_product_id' to the product_id of the matching product, or null if none match.\n"
            "  - Set 'detected_product_name' to the name of the matching product, or null if none match.\n"
            "  - Return 'possible_causes' as objects with: cause, probability from 0 to 1, status ('possible' or 'confirmed'), evidence, and source.\n"
            "  - Return 'eliminated_causes' as objects with: cause, probability 0, status 'eliminated', evidence if available, source, and elimination_reason.\n"
            "  - Set 'most_likely_cause' to the highest-probability non-eliminated cause, or 'Insufficient information'.\n"
            "  - Set 'confidence' to exactly 'low', 'medium', or 'high'. Use low until enough answers and documentation evidence support a conclusion.\n"
            "  - If an image is attached, analyze warning lights, error messages, damaged components, missing parts, leaks, corrosion, broken wiring, and wear indicators. Do not invent details that are not visible. Return 'visual_analysis' with visible_items, confidence, relevance_to_issue, additional_photos_required, and safety_notes.\n"
            "  - Set 'investigation_reasoning' EXACTLY in the following format:\n\n"
            "Current Understanding:\n"
            "[summary of symptoms and identified product context]\n\n"
            "Most Likely Causes:\n"
            "1. [First cause]\n"
            "2. [Second cause]\n"
            "3. [Third cause]\n\n"
            "Next Diagnostic Question:\n"
            "[A targeted question to ask for more symptoms or clarify the device behavior]\n\n"
            "Reason:\n"
            "[Why this question helps narrow possibilities]\n\n"
            "  - Set 'probable_causes' to likely causes.\n"
            "  - Set 'follow_up_question' to a targeted clarifying question to begin progressive troubleshooting.\n"
            "  - Set 'next_step' to a step description.\n"
            "  - Set 'recommended_action' using this format: Recommendation: Click Select to open the diagnostic assistant for this product\\n\\nEvidence: [brief relevant documentation facts, not long copied text]\\n\\nSource:\\nDocument Name\\nPage Number\\nSection Heading. If documentation does not support a claim, say so explicitly.\n"
            "  - Set 'cited_sources' to a list of 1-based indices of the retrieved sources actually used (e.g. [1]).\n"
            "  - Set 'spare_parts' as a list of objects. Recommend spare parts ONLY when the retrieved documentation explicitly supports replacement. Never recommend parts that are incompatible with the product. Each spare part object MUST contain: 'part_name' (string), 'part_number' (string, or 'Unknown'), 'compatibility' (string), 'reason_replacement_may_be_needed' (string), and 'source_index' (integer). If the documentation does not support replacement of any spare parts, set it to [].\n\n"
            "You MUST return a single, valid JSON object with the keys 'detected_product_id', 'detected_product_name', 'possible_causes', 'eliminated_causes', 'most_likely_cause', 'confidence', 'visual_analysis', 'investigation_reasoning', 'probable_causes', 'follow_up_question', 'next_step', 'recommended_action', 'cited_sources', and 'spare_parts'. Do not wrap the JSON in markdown code blocks. Do not add any text before or after the JSON."
        )

        answer = await self._generate_text(
            instructions=instructions,
            prompt=prompt,
            temperature=0.2,
            image_data=image_data,
            image_mime_type=image_mime_type,
        )
        parsed = self._parse_json_object(answer)
        if parsed is None:
            return {
                "detected_product_id": None,
                "detected_product_name": None,
                "investigation_reasoning": "We need to clarify which device is experiencing the problem.",
                "probable_causes": ["Unknown Product"],
                "possible_causes": [
                    {
                        "cause": "Unknown Product",
                        "probability": 0.0,
                        "status": "possible",
                        "evidence": "No matching product documentation could be confirmed.",
                        "source": None,
                        "elimination_reason": None,
                    }
                ],
                "eliminated_causes": [],
                "most_likely_cause": "Unknown Product",
                "confidence": "low",
                "visual_analysis": self._visual_analysis(parsed=None, image_attached=bool(image_data)),
                "follow_up_question": "Which of our products are you referring to?",
                "next_step": "Identify product",
                "recommended_action": "Select a product from the list to begin specific diagnostics.",
                "cited_sources": None,
                "spare_parts": [],
            }

        possible_causes = self._cause_list(parsed.get("possible_causes"), parsed.get("probable_causes"))
        eliminated_causes = self._cause_list(parsed.get("eliminated_causes"), None, default_status="eliminated")
        probable_causes = [cause["cause"] for cause in possible_causes if cause["cause"]]
        if not probable_causes:
            probable_causes = self._string_list(parsed.get("probable_causes"), default=[])

        return {
            "detected_product_id": parsed.get("detected_product_id") or None,
            "detected_product_name": parsed.get("detected_product_name") or None,
            "investigation_reasoning": str(parsed.get("investigation_reasoning") or "").strip(),
            "probable_causes": probable_causes,
            "possible_causes": possible_causes,
            "eliminated_causes": eliminated_causes,
            "most_likely_cause": str(parsed.get("most_likely_cause") or (probable_causes[0] if probable_causes else "")).strip()
            or "Insufficient information",
            "confidence": self._confidence(parsed.get("confidence")),
            "visual_analysis": self._visual_analysis(parsed.get("visual_analysis"), image_attached=bool(image_data)),
            "follow_up_question": str(parsed.get("follow_up_question") or "").strip(),
            "next_step": str(parsed.get("next_step") or "").strip(),
            "recommended_action": str(parsed.get("recommended_action") or "").strip(),
            "cited_sources": parsed.get("cited_sources") if isinstance(parsed.get("cited_sources"), list) else None,
            "spare_parts": self._parse_spare_parts(parsed.get("spare_parts"), documents),
        }

    async def _generate_text(
        self,
        instructions: str,
        prompt: str,
        temperature: float = 0.1,
        image_data: str | None = None,
        image_mime_type: str | None = None,
    ) -> str:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ConfigurationError("GEMINI_API_KEY must be set.")

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent"
        )
        user_parts: list[dict[str, Any]] = [{"text": prompt}]
        if image_data:
            user_parts.append(
                {
                    "inlineData": {
                        "mimeType": image_mime_type or "image/jpeg",
                        "data": self._clean_base64_image(image_data),
                    }
                }
            )

        payload = {
            "systemInstruction": {"parts": [{"text": instructions}]},
            "contents": [{"role": "user", "parts": user_parts}],
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
            "You are an expert product diagnostic technician. Your role is NOT to act as a chatbot, search engine, FAQ bot, "
            "or generic document retriever. You must behave like an experienced mechanic, service engineer, field technician, "
            "or repair specialist.\n"
            "Analyze the user's input, the diagnostic history, and the retrieved context to classify the intent:\n"
            "1. Educational/Conceptual/General (e.g., 'What is Moss?', 'What is mesh networking?', 'How does it work?'):\n"
            "   - Set 'probable_causes' to an empty list [].\n"
            "   - Set 'possible_causes' and 'eliminated_causes' to empty lists [].\n"
            "   - Set 'most_likely_cause' to null and 'confidence' to 'low'.\n"
            "   - If an image is attached, set 'visual_analysis' by listing visible items only; do not infer hidden damage.\n"
            "   - Set 'investigation_reasoning' to a friendly, natural, direct, and comprehensive explanation of the concept or product. Address the user directly using the second person. Do NOT include third-person/robotic reasoning.\n"
            "   - Set 'follow_up_question' to a helpful follow-up question related to the concept or asking if they have a diagnostic problem.\n"
            "   - Set 'next_step' to 'Conceptual inquiry'.\n"
            "   - Set 'recommended_action' using this format: Recommendation: ...\\n\\nEvidence: ...\\n\\nSource:\\nDocument Name\\nPage Number\\nSection Heading. If documentation does not support a claim, say so explicitly.\n"
            "   - Set 'cited_sources' to the 1-based indices of the retrieved sources that you used to construct the answer (e.g., [1, 2] or []).\n"
            "   - Set 'spare_parts' to a list of recommended spare parts if the documentation explicitly supports their replacement for this inquiry, otherwise set it to [].\n"
            "2. Diagnostic/Troubleshooting (e.g., 'My mesh node won't connect', 'LaserJet has a paper jam'):\n"
            "   - When a user reports an issue, follow this systematic approach:\n"
            "     1. Understand the symptoms.\n"
            "     2. Gather context.\n"
            "     3. Identify possible causes.\n"
            "     4. Ask targeted follow-up questions.\n"
            "     5. Eliminate unlikely causes.\n"
            "     6. Narrow down the most probable root cause.\n"
            "     7. Recommend safe inspection steps.\n"
            "     8. Recommend corrective actions.\n"
            "     9. Support conclusions using official product documentation.\n"
            "   - Follow these strict rules:\n"
            "     * Never immediately provide a diagnosis when information is insufficient.\n"
            "     * Ask one high-value diagnostic question at a time.\n"
            "     * Use a process-of-elimination approach.\n"
            "     * Avoid overwhelming the user with many questions at once.\n"
            "     * Prioritize user safety.\n"
            "     * Never suggest unsafe procedures.\n"
            "     * Clearly state when professional service is required.\n"
            "     * Cite supporting documentation whenever available.\n"
            "     * Distinguish between confirmed facts and assumptions.\n"
            "   - Treat retrieved official product documentation as evidence. Do not copy large sections. Extract relevant facts, explain them simply, relate them to the user's issue, and cite document name, page number, and section heading when available.\n"
            "   - If documentation does not support a claim, say so explicitly in 'recommended_action' and keep confidence low.\n"
            "   - Return 'possible_causes' as objects with: cause, probability from 0 to 1, status ('possible' or 'confirmed'), evidence, and source.\n"
            "   - Return 'eliminated_causes' as objects with: cause, probability 0, status 'eliminated', evidence if available, source, and elimination_reason.\n"
            "   - Set 'most_likely_cause' to the highest-probability non-eliminated cause, or 'Insufficient information'.\n"
            "   - Set 'confidence' to exactly 'low', 'medium', or 'high'. Use low when key evidence is missing, medium when one cause is more likely but not proven, and high only when symptoms plus documentation confirm it.\n"
            "   - If an image is attached, analyze warning lights, error messages, damaged components, missing parts, leaks, corrosion, broken wiring, and wear indicators. Do not invent details that are not visible. Return 'visual_analysis' with visible_items, confidence, relevance_to_issue, additional_photos_required, and safety_notes.\n"
            "   - If you need more evidence or are asking a diagnostic question, you MUST format the 'investigation_reasoning' field EXACTLY as follows:\n\n"
            "Current Understanding:\n"
            "[summary of current symptoms and gathered context]\n\n"
            "Most Likely Causes:\n"
            "1. [First cause]\n"
            "2. [Second cause]\n"
            "3. [Third cause]\n\n"
            "Next Diagnostic Question:\n"
            "[The specific targeted question being asked]\n\n"
            "Reason:\n"
            "[Why this question helps narrow possibilities]\n\n"
            "   - Only provide final recommendations once enough evidence has been gathered. If you have gathered enough evidence to confirm the root cause, format the 'investigation_reasoning' field EXACTLY as follows:\n\n"
            "Current Understanding:\n"
            "[summary of symptoms and confirmed root cause]\n\n"
            "Most Likely Causes:\n"
            "1. [Confirmed root cause]\n\n"
            "Corrective Action:\n"
            "[Safe corrective actions from the official documentation]\n\n"
            "Official Citations:\n"
            "[Citations of the supporting documentation]\n\n"
            "   - Set 'probable_causes' to the list of causes currently under consideration.\n"
            "   - Set 'follow_up_question' to your targeted clarifying question, or if you reached the final diagnosis, a question like 'Does this resolve the issue?'\n"
            "   - Set 'next_step' to the physical check/action the user should perform next.\n"
            "   - Set 'recommended_action' using this format: Recommendation: ...\\n\\nEvidence: ...\\n\\nSource:\\nDocument Name\\nPage Number\\nSection Heading. If documentation does not support a claim, say so explicitly.\n"
            "   - Set 'cited_sources' to the 1-based indices of the retrieved sources that you used (e.g., [1]).\n"
            "   - Set 'spare_parts' as a list of objects. Recommend spare parts ONLY when the retrieved documentation explicitly supports replacement. Never recommend parts that are incompatible with the product. Each spare part object MUST contain: 'part_name' (string, name of the part), 'part_number' (string, the part number/ID mentioned in the documentation, or 'Unknown' if not mentioned), 'compatibility' (string, product compatibility details), 'reason_replacement_may_be_needed' (string, concise reason why replacement may be needed as per documentation), and 'source_index' (integer, the 1-based index of the retrieved source that supports this replacement). If the documentation does not support replacement of any spare parts for the given issue or product, return an empty list [].\n\n"
            "You MUST return a single, valid JSON object with the keys 'possible_causes', 'eliminated_causes', 'most_likely_cause', 'confidence', 'visual_analysis', 'probable_causes', 'investigation_reasoning', 'follow_up_question', 'next_step', 'recommended_action', 'cited_sources', and 'spare_parts'.\n"
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
        image_attached: bool = False,
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
                f"page: {metadata.get('page', '')}\n"
                f"section: {metadata.get('section', '')}\n"
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
        image_context = (
            "\n\nUser-uploaded image: attached. Analyze only visible details and ask for another angle when uncertain."
            if image_attached
            else ""
        )
        return (
            f"Product: {product_name}\n"
            f"Issue description: {issue_description}\n\n"
            f"Diagnostic history:\n{history}\n\n"
            f"Retrieved documentation:\n{context}"
            f"{image_context}"
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

    @classmethod
    def _parse_spare_parts(cls, value: Any, documents: list[SearchResultItem]) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        
        spare_parts = []
        for item in value:
            if not isinstance(item, dict):
                continue
            
            part_name = str(item.get("part_name") or "").strip()
            if not part_name:
                continue
            
            part_number = str(item.get("part_number") or "Unknown").strip()
            compatibility = str(item.get("compatibility") or "").strip()
            reason = str(item.get("reason_replacement_may_be_needed") or item.get("reason") or "").strip()
            
            source_index = item.get("source_index")
            try:
                if source_index is not None:
                    source_index = int(source_index)
                else:
                    source_index = None
            except (ValueError, TypeError):
                source_index = None
            
            doc_source = None
            if source_index is not None and 1 <= source_index <= len(documents):
                doc = documents[source_index - 1]
                meta = doc.metadata
                title = meta.get("title")
                section = meta.get("section")
                page = meta.get("page")
                parts = []
                if title:
                    parts.append(title)
                if section:
                    parts.append(section)
                if page:
                    parts.append(f"Page {page}")
                doc_source = " | ".join(parts)
            else:
                doc_source = item.get("documentation_source")
                if doc_source:
                    doc_source = str(doc_source).strip()
            
            spare_parts.append({
                "part_name": part_name,
                "part_number": part_number,
                "compatibility": compatibility,
                "reason_replacement_may_be_needed": reason,
                "documentation_source": doc_source,
                "source_index": source_index
            })
        return spare_parts

    @staticmethod
    def _string_list(value: Any, default: list[str] | None = None) -> list[str]:
        fallback = default if default is not None else ["Insufficient documentation evidence."]
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return cleaned or fallback
        if value:
            return [str(value).strip()]
        return fallback

    @classmethod
    def _cause_list(
        cls,
        value: Any,
        fallback: Any,
        default_status: str = "possible",
    ) -> list[dict[str, object]]:
        raw_items = value if isinstance(value, list) else None
        if raw_items is None and fallback is not None:
            raw_items = fallback if isinstance(fallback, list) else [fallback]
        if not raw_items:
            return []

        causes: list[dict[str, object]] = []
        for item in raw_items:
            if isinstance(item, dict):
                name = str(
                    item.get("cause")
                    or item.get("name")
                    or item.get("title")
                    or item.get("reason")
                    or ""
                ).strip()
                evidence = item.get("evidence")
                source = item.get("source")
                elimination_reason = item.get("elimination_reason") or item.get("reason")
                status = str(item.get("status") or default_status).strip().lower()
                probability = cls._probability(item.get("probability") or item.get("confidence") or item.get("likelihood"))
            else:
                name = str(item).strip()
                evidence = None
                source = None
                elimination_reason = None
                status = default_status
                probability = 0.0

            if not name:
                continue
            if status not in {"possible", "eliminated", "confirmed"}:
                status = default_status
            if default_status == "eliminated":
                status = "eliminated"
            causes.append(
                {
                    "cause": name,
                    "probability": probability,
                    "status": status,
                    "evidence": str(evidence).strip() if evidence else None,
                    "source": str(source).strip() if source else None,
                    "elimination_reason": str(elimination_reason).strip() if elimination_reason else None,
                }
            )
        return causes

    @staticmethod
    def _probability(value: Any) -> float:
        if value is None:
            return 0.0
        if isinstance(value, (int, float)):
            number = float(value)
        else:
            match = re.search(r"\d+(?:\.\d+)?", str(value))
            if not match:
                return 0.0
            number = float(match.group(0))
        if number > 1:
            number = number / 100
        return min(1.0, max(0.0, round(number, 3)))

    @staticmethod
    def _confidence(value: Any) -> str:
        confidence = str(value or "low").strip().lower()
        if confidence in {"low", "medium", "high"}:
            return confidence
        if confidence in {"med", "moderate"}:
            return "medium"
        return "low"

    @classmethod
    def _visual_analysis(cls, parsed: Any, image_attached: bool) -> dict[str, object] | None:
        if not image_attached:
            return None
        if not isinstance(parsed, dict):
            return {
                "visible_items": [],
                "confidence": "low",
                "relevance_to_issue": "An image was attached, but structured visual findings were not returned.",
                "additional_photos_required": ["Upload a clearer photo from another angle."],
                "safety_notes": [],
            }

        return {
            "visible_items": cls._string_list(parsed.get("visible_items"), default=[]),
            "confidence": cls._confidence(parsed.get("confidence")),
            "relevance_to_issue": str(parsed.get("relevance_to_issue") or "").strip() or None,
            "additional_photos_required": cls._string_list(parsed.get("additional_photos_required"), default=[]),
            "safety_notes": cls._string_list(parsed.get("safety_notes"), default=[]),
        }

    @staticmethod
    def _clean_base64_image(image_data: str) -> str:
        if "," in image_data and image_data.strip().lower().startswith("data:"):
            return image_data.split(",", 1)[1].strip()
        return image_data.strip()
