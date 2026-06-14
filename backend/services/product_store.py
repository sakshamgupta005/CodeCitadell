from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from uuid import uuid4

from models.schemas import Product, ProductCreate
from services.config import BASE_DIR
from services.exceptions import InputValidationError, NotFoundError


SAMPLE_PRODUCTS = [
    Product(
        id="moss-router-x1",
        name="Moss Router X1",
        category="Networking",
        description="Compact mesh router for high-speed home and office networks.",
        image_url="https://images.unsplash.com/photo-1606904825846-647eb07f5be2",
    ),
    Product(
        id="hp-laserjet-pro-m404n",
        name="HP LaserJet Pro M404n",
        category="Electronics",
        description="Monochrome laser printer designed for small-to-medium workgroups with fast print speeds and security.",
        image_url="https://images.unsplash.com/photo-1563206767-5b18f218e8de",
    ),
    Product(
        id="smart-air-conditioner",
        name="Smart Air Conditioner",
        category="HVAC",
        description="Advanced split AC system with smart climate scheduling and real-time power analytics.",
        image_url="https://images.unsplash.com/photo-1621905252507-b354bc25edac",
    ),
    Product(
        id="smart-washing-machine",
        name="Smart Washing Machine",
        category="Appliances",
        description="High-efficiency front-load washing machine with custom cycle programming and automatic detergent dispensing.",
        image_url="https://images.unsplash.com/photo-1582730147233-ac81111d0458",
    ),
    Product(
        id="water-purifier",
        name="Water Purifier",
        category="Appliances",
        description="Multi-stage RO filtration system with live TDS monitoring and filter replacement alerts.",
        image_url="https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b",
    ),
]


class ProductStore:
    def __init__(
        self,
        products_path: Path | None = None,
        sessions_path: Path | None = None,
    ) -> None:
        self.products_path = products_path or BASE_DIR / "storage" / "products.json"
        self.sessions_path = sessions_path or BASE_DIR / "storage" / "diagnostic_sessions.json"
        self._lock = Lock()
        self.products_path.parent.mkdir(parents=True, exist_ok=True)
        self._seed_products_if_needed()
        self._ensure_json_file(self.sessions_path, {})

    def create_product(self, payload: ProductCreate) -> Product:
        product_id = self._normalize_id(payload.id or payload.name)
        product = Product(
            id=product_id,
            name=payload.name.strip(),
            category=payload.category.strip(),
            description=payload.description.strip(),
            image_url=payload.image_url.strip(),
        )

        with self._lock:
            products = self._read_products_unlocked()
            if any(item.id == product.id for item in products):
                raise InputValidationError(f"Product id already exists: {product.id}")
            products.append(product)
            self._write_json_unlocked(self.products_path, [item.model_dump() for item in products])
        return product

    def list_products(self, query: str | None = None, category: str | None = None) -> list[Product]:
        with self._lock:
            products = self._read_products_unlocked()

        query_text = (query or "").strip().lower()
        category_text = (category or "").strip().lower()
        if query_text:
            products = [
                product
                for product in products
                if query_text in product.name.lower() or query_text in product.category.lower()
            ]
        if category_text:
            products = [
                product
                for product in products
                if category_text in product.category.lower()
            ]
        return sorted(products, key=lambda item: item.name.lower())

    def get_product(self, product_id: str) -> Product:
        with self._lock:
            products = self._read_products_unlocked()
        for product in products:
            if product.id == product_id:
                return product
        raise NotFoundError(f"Product not found: {product_id}")

    def update_product(self, product_id: str, payload: ProductCreate) -> Product:
        with self._lock:
            products = self._read_products_unlocked()
            found = False
            updated_product = None
            for i, p in enumerate(products):
                if p.id == product_id:
                    updated_product = Product(
                        id=product_id,
                        name=payload.name.strip(),
                        category=payload.category.strip(),
                        description=payload.description.strip(),
                        image_url=payload.image_url.strip(),
                    )
                    products[i] = updated_product
                    found = True
                    break
            if not found:
                raise NotFoundError(f"Product not found: {product_id}")
            self._write_json_unlocked(self.products_path, [item.model_dump() for item in products])
        return updated_product

    def delete_product(self, product_id: str) -> None:
        with self._lock:
            products = self._read_products_unlocked()
            found = False
            new_products = []
            for p in products:
                if p.id == product_id:
                    found = True
                else:
                    new_products.append(p)
            if not found:
                raise NotFoundError(f"Product not found: {product_id}")
            self._write_json_unlocked(self.products_path, [item.model_dump() for item in new_products])

    def create_diagnostic_session(self, product_id: str, issue_description: str) -> dict[str, object]:
        session = {
            "id": str(uuid4()),
            "product_id": product_id,
            "issue_description": issue_description.strip(),
            "answers": [],
            "latest_question": None,
            "probable_causes": [],
            "possible_causes": [],
            "eliminated_causes": [],
            "most_likely_cause": None,
            "confidence": "low",
            "next_step": None,
            "recommended_action": None,
            "created_at": self._now(),
            "updated_at": self._now(),
        }
        with self._lock:
            sessions = self._read_json_unlocked(self.sessions_path, {})
            sessions[session["id"]] = session
            self._write_json_unlocked(self.sessions_path, sessions)
        return session

    def get_diagnostic_session(self, session_id: str) -> dict[str, object]:
        with self._lock:
            sessions = self._read_json_unlocked(self.sessions_path, {})
            session = sessions.get(session_id)
        if not isinstance(session, dict):
            raise NotFoundError(f"Diagnostic session not found: {session_id}")
        return session

    def add_diagnostic_answer(self, session_id: str, answer: str, image_attached: bool = False) -> dict[str, object]:
        with self._lock:
            sessions = self._read_json_unlocked(self.sessions_path, {})
            session = sessions.get(session_id)
            if not isinstance(session, dict):
                raise NotFoundError(f"Diagnostic session not found: {session_id}")

            answers = list(session.get("answers") or [])
            answers.append(
                {
                    "question": str(session.get("latest_question") or ""),
                    "answer": answer.strip(),
                    "image_attached": image_attached,
                    "answered_at": self._now(),
                }
            )
            session["answers"] = answers
            session["updated_at"] = self._now()
            sessions[session_id] = session
            self._write_json_unlocked(self.sessions_path, sessions)
        return session

    def update_diagnostic_session(
        self,
        session_id: str,
        probable_causes: list[str],
        latest_question: str,
        next_step: str,
        recommended_action: str,
        investigation_reasoning: str | None = None,
        possible_causes: list[dict[str, object]] | None = None,
        eliminated_causes: list[dict[str, object]] | None = None,
        most_likely_cause: str | None = None,
        confidence: str | None = None,
    ) -> dict[str, object]:
        with self._lock:
            sessions = self._read_json_unlocked(self.sessions_path, {})
            session = sessions.get(session_id)
            if not isinstance(session, dict):
                raise NotFoundError(f"Diagnostic session not found: {session_id}")
            session["probable_causes"] = probable_causes
            if possible_causes is not None:
                session["possible_causes"] = possible_causes
            if eliminated_causes is not None:
                session["eliminated_causes"] = eliminated_causes
            if most_likely_cause is not None:
                session["most_likely_cause"] = most_likely_cause
            if confidence is not None:
                session["confidence"] = confidence
            session["latest_question"] = latest_question
            session["next_step"] = next_step
            session["recommended_action"] = recommended_action
            if investigation_reasoning:
                session["investigation_reasoning"] = investigation_reasoning
            session["updated_at"] = self._now()
            sessions[session_id] = session
            self._write_json_unlocked(self.sessions_path, sessions)
        return session

    def _seed_products_if_needed(self) -> None:
        try:
            products = self._read_products_unlocked() if (self.products_path.exists() and self.products_path.stat().st_size > 0) else []
        except Exception:
            products = []
        
        existing_ids = {p.id for p in products}
        added = False
        for p in SAMPLE_PRODUCTS:
            if p.id not in existing_ids:
                products.append(p)
                added = True
        if added or not self.products_path.exists() or self.products_path.stat().st_size == 0:
            self._write_json_unlocked(self.products_path, [item.model_dump() for item in products])

    @staticmethod
    def _ensure_json_file(path: Path, default: object) -> None:
        if path.exists() and path.stat().st_size > 0:
            return
        path.write_text(json.dumps(default, indent=2), encoding="utf-8")

    def _read_products_unlocked(self) -> list[Product]:
        raw_products = self._read_json_unlocked(self.products_path, [])
        if not isinstance(raw_products, list):
            raise InputValidationError("Product storage is invalid.")
        return [Product(**item) for item in raw_products if isinstance(item, dict)]

    @staticmethod
    def _read_json_unlocked(path: Path, default: object) -> object:
        if not path.exists() or path.stat().st_size == 0:
            return default
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    @staticmethod
    def _write_json_unlocked(path: Path, data: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(f"{path.suffix}.tmp")
        tmp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp_path.replace(path)

    @staticmethod
    def _normalize_id(value: str) -> str:
        normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
        if not normalized:
            raise InputValidationError("Product id must contain at least one letter or number.")
        return normalized

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).isoformat()


product_store = ProductStore()
