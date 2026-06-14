from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")
load_dotenv()


@dataclass(frozen=True)
class Settings:
    moss_project_id: str | None = os.getenv("MOSS_PROJECT_ID")
    moss_project_key: str | None = os.getenv("MOSS_PROJECT_KEY")
    github_token: str | None = os.getenv("GITHUB_TOKEN")
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")

    moss_index_name: str = os.getenv("MOSS_INDEX_NAME", "product-support")
    moss_model_id: str = os.getenv("MOSS_MODEL_ID", "moss-minilm")
    moss_wait_for_index_seconds: int = int(os.getenv("MOSS_WAIT_FOR_INDEX_SECONDS", "120"))
    moss_search_alpha: float = float(os.getenv("MOSS_SEARCH_ALPHA", "0.7"))

    github_max_pages: int = int(os.getenv("GITHUB_MAX_PAGES", "3"))
    github_timeout_seconds: int = int(os.getenv("GITHUB_TIMEOUT_SECONDS", "20"))

    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    gemini_timeout_seconds: int = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "30"))
    max_context_chars: int = int(os.getenv("MAX_CONTEXT_CHARS", "14000"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
