from __future__ import annotations

import asyncio
import logging
import json
import re
from pathlib import Path
from typing import Sequence

from moss import DocumentInfo, MossClient, MutationOptions, QueryOptions

from models.schemas import KnowledgeDocument, SearchResultItem
from services.config import get_settings, BASE_DIR
from services.exceptions import ConfigurationError, ExternalServiceError, InputValidationError


logger = logging.getLogger(__name__)


class MossService:
    def __init__(self) -> None:
        self._client: MossClient | None = None
        self._loaded_index = False

    @property
    def index_name(self) -> str:
        return get_settings().moss_index_name

    @property
    def client(self) -> MossClient:
        if self._client is None:
            settings = get_settings()
            if not settings.moss_project_id or not settings.moss_project_key:
                raise ConfigurationError(
                    "Moss is not configured. Set MOSS_PROJECT_ID and MOSS_PROJECT_KEY in backend/.env."
                )
            self._client = MossClient(settings.moss_project_id, settings.moss_project_key)
        return self._client

    async def create_index_if_needed(
        self,
        documents: Sequence[KnowledgeDocument] | None = None,
    ) -> object | None:
        try:
            if await self._index_exists():
                return None
            if not documents:
                raise InputErrorForEmptyIndex(
                    "No documents were available to index. Upload product knowledge first."
                )

            settings = get_settings()
            logger.info("Creating Moss index %s with %s documents", self.index_name, len(documents))
            result = await self.client.create_index(
                self.index_name,
                self._to_moss_documents(documents),
                model_id=settings.moss_model_id,
            )
            await self._wait_for_job(getattr(result, "job_id", None))
            await self._load_index_best_effort(force=True)
            return result
        except Exception as exc:
            logger.warning("Moss index creation failed or index exists check failed: %s", exc)
            return None

    async def add_documents(self, documents: Sequence[KnowledgeDocument]) -> tuple[int, str | None]:
        if not documents:
            return 0, None

        try:
            create_result = await self.create_index_if_needed(documents)
            if create_result is not None:
                self._save_to_local_store(documents)
                return len(documents), getattr(create_result, "job_id", None)

            logger.info("Upserting %s documents into Moss index %s", len(documents), self.index_name)
            result = await self.client.add_docs(
                self.index_name,
                self._to_moss_documents(documents),
                MutationOptions(upsert=True),
            )
            await self._wait_for_job(getattr(result, "job_id", None))
            await self._load_index_best_effort(force=True)
            self._save_to_local_store(documents)
            return len(documents), getattr(result, "job_id", None)
        except Exception as exc:
            logger.warning("Moss add_documents failed, falling back to local storage: %s", exc)
            self._save_to_local_store(documents)
            return len(documents), "local-job-fallback"

    async def search_documents(self, query: str, top_k: int = 10) -> list[SearchResultItem]:
        # Always run local search as a fallback/merge candidate
        local_results = self._search_local_store(query, top_k=top_k * 2)

        try:
            await self._load_index_best_effort(force=True)
            settings = get_settings()
            logger.info("Searching Moss index %s for query=%r", self.index_name, query)
            result = await self.client.query(
                self.index_name,
                query,
                QueryOptions(top_k=top_k, alpha=settings.moss_search_alpha),
            )
            docs = getattr(result, "docs", [])
            cloud_results = [self._to_search_item(document) for document in docs]

            # Merge cloud and local results, maintaining uniqueness by doc ID
            seen_ids = set()
            merged = []
            for item in cloud_results:
                if item.id not in seen_ids:
                    seen_ids.add(item.id)
                    merged.append(item)
            for item in local_results:
                if item.id not in seen_ids:
                    seen_ids.add(item.id)
                    merged.append(item)

            # Sort by score descending
            merged.sort(key=lambda x: x.score or 0.0, reverse=True)
            return merged[:top_k]
        except Exception as exc:
            logger.warning("Moss cloud search failed (falling back to local): %s", exc)
            return local_results[:top_k]

    async def _index_exists(self) -> bool:
        try:
            indexes = await self.client.list_indexes()
            return any(getattr(index, "name", None) == self.index_name for index in indexes)
        except Exception as exc:
            logger.warning("Could not list Moss indexes: %s", exc)
            return False

    async def _wait_for_job(self, job_id: str | None) -> None:
        if not job_id or job_id == "local-job-fallback":
            return

        timeout_seconds = get_settings().moss_wait_for_index_seconds
        if timeout_seconds <= 0:
            return

        deadline = asyncio.get_running_loop().time() + timeout_seconds
        while True:
            status_response = await self.client.get_job_status(job_id)
            status = self._status_value(getattr(status_response, "status", "")).lower()
            if status in {"completed", "ready", "succeeded", "success"}:
                return
            if status in {"failed", "error"}:
                error = getattr(status_response, "error", None) or "unknown error"
                raise ExternalServiceError(f"Moss indexing job failed: {error}")
            if asyncio.get_running_loop().time() >= deadline:
                logger.warning("Timed out waiting for Moss job %s; continuing anyway", job_id)
                return
            await asyncio.sleep(1.0)

    async def _load_index_best_effort(self, force: bool = False) -> None:
        if self._loaded_index and not force:
            return
        try:
            await self.client.load_index(self.index_name)
            self._loaded_index = True
            logger.info("Loaded Moss index %s for local search", self.index_name)
        except Exception as exc:
            self._loaded_index = False
            logger.warning("Could not load Moss index locally; cloud query fallback may be used: %s", exc)

    def _save_to_local_store(self, documents: Sequence[KnowledgeDocument]) -> None:
        try:
            storage_dir = Path(BASE_DIR) / "storage"
            storage_dir.mkdir(parents=True, exist_ok=True)
            local_path = storage_dir / "local_indexed_documents.json"
            
            data = {}
            if local_path.exists() and local_path.stat().st_size > 0:
                try:
                    with open(local_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                    data = {}
            
            for doc in documents:
                data[doc.id] = {
                    "id": doc.id,
                    "text": doc.text,
                    "metadata": doc.metadata
                }
                
            tmp_path = local_path.with_suffix(".tmp")
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            tmp_path.replace(local_path)
            logger.info("Saved %d documents to local fallback storage", len(documents))
        except Exception as exc:
            logger.error("Failed to save to local fallback storage: %s", exc)

    def _search_local_store(self, query: str, top_k: int = 10) -> list[SearchResultItem]:
        try:
            local_path = Path(BASE_DIR) / "storage" / "local_indexed_documents.json"
            if not local_path.exists():
                logger.info("Local fallback store does not exist: %s", local_path)
                return []
            with open(local_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as exc:
            logger.error("Failed to read local indexed documents: %s", exc)
            return []

        # Tokenize query
        query_tokens = [t.lower() for t in re.findall(r"\w+", query) if len(t) > 1]
        if not query_tokens:
            query_tokens = [query.lower()]

        results = []
        for doc_id, doc_info in data.items():
            text = doc_info.get("text", "")
            metadata = doc_info.get("metadata", {})

            score = 0.0
            text_lower = text.lower()

            # Boost matches in product_id specifically
            product_id = metadata.get("product_id", "")
            if product_id and product_id.lower() in query.lower():
                score += 15.0

            for token in query_tokens:
                # Term frequency count
                count = text_lower.count(token)
                score += count * 1.0

                # Boost matches in metadata value
                for key, val in metadata.items():
                    val_lower = str(val).lower()
                    if token in val_lower:
                        if key == "product_id":
                            score += 10.0
                        elif key == "title":
                            score += 5.0
                        else:
                            score += 2.0

            if score > 0:
                results.append(
                    SearchResultItem(
                        id=doc_id,
                        text=text,
                        metadata={str(k): str(v) for k, v in metadata.items()},
                        score=score,
                    )
                )

        results.sort(key=lambda x: x.score or 0.0, reverse=True)
        return results[:top_k]

    @staticmethod
    def _to_moss_documents(documents: Sequence[KnowledgeDocument]) -> list[DocumentInfo]:
        return [
            DocumentInfo(id=document.id, text=document.text, metadata=document.metadata)
            for document in documents
        ]

    @staticmethod
    def _to_search_item(document: object) -> SearchResultItem:
        metadata = getattr(document, "metadata", None) or {}
        return SearchResultItem(
            id=str(getattr(document, "id", "")),
            text=str(getattr(document, "text", "")),
            metadata={str(key): str(value) for key, value in metadata.items()},
            score=float(getattr(document, "score", 0.0) or 0.0),
        )

    @staticmethod
    def _status_value(status: object) -> str:
        value = getattr(status, "value", status)
        return str(value)


class InputErrorForEmptyIndex(InputValidationError):
    pass
