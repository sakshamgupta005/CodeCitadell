from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, Query, UploadFile, status

from models.schemas import (
    DiagnosticRequest,
    DiagnosticResponse,
    ImportResponse,
    KnowledgeDocument,
    Product,
    ProductCreate,
    UrlKnowledgeRequest,
)
from services.diagnostic_service import diagnostic_service
from services.exceptions import InputValidationError
from services.import_tracker import import_tracker
from services.moss_service import MossService
from services.product_knowledge_service import product_knowledge_service
from services.product_store import product_store


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products", tags=["products"])

moss_service = MossService()


@router.post("", response_model=Product, status_code=status.HTTP_201_CREATED)
async def create_product(payload: ProductCreate) -> Product:
    return product_store.create_product(payload)


@router.get("", response_model=list[Product])
async def list_products(
    query: str | None = Query(default=None, description="Search by product name or category."),
    category: str | None = Query(default=None, description="Filter by product category."),
) -> list[Product]:
    return product_store.list_products(query=query, category=category)


@router.get("/search", response_model=list[Product])
async def search_products(
    query: str | None = Query(default=None, description="Search by product name or category."),
    category: str | None = Query(default=None, description="Filter by product category."),
) -> list[Product]:
    return product_store.list_products(query=query, category=category)


@router.get("/{product_id}", response_model=Product)
async def get_product(product_id: str) -> Product:
    return product_store.get_product(product_id)


@router.put("/{product_id}", response_model=Product)
async def update_product(product_id: str, payload: ProductCreate) -> Product:
    return product_store.update_product(product_id, payload)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: str) -> None:
    product_store.delete_product(product_id)


@router.post("/{product_id}/knowledge/pdf", response_model=ImportResponse)
async def upload_product_pdf(product_id: str, file: UploadFile = File(...)) -> ImportResponse:
    product = product_store.get_product(product_id)
    import_id = import_tracker.start(
        source="product_pdf",
        index_name=moss_service.index_name,
        filename=file.filename,
        product_id=product.id,
    )
    logger.info("Product PDF import started product=%s filename=%s import_id=%s", product.id, file.filename, import_id)
    try:
        content = await file.read()
        text = product_knowledge_service.parse_pdf(content)
        documents = product_knowledge_service.build_documents(
            product=product,
            text=text,
            source_type="pdf",
            title=file.filename or "PDF document",
            filename=file.filename,
        )
        indexed_count, job_id = await moss_service.add_documents(documents)
    except Exception as exc:
        import_tracker.fail(import_id, str(exc))
        logger.exception("Product PDF import failed product=%s filename=%s", product.id, file.filename)
        raise

    return _complete_import(
        import_id=import_id,
        product_id=product.id,
        documents=documents,
        indexed_count=indexed_count,
        job_id=job_id,
        message=f"Indexed {indexed_count} PDF knowledge chunks for {product.name}.",
    )


@router.post("/{product_id}/knowledge/text", response_model=ImportResponse)
async def upload_product_text(
    product_id: str,
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    title: str | None = Form(default=None),
) -> ImportResponse:
    product = product_store.get_product(product_id)
    filename = file.filename if file else None
    import_id = import_tracker.start(
        source="product_text",
        index_name=moss_service.index_name,
        filename=filename,
        product_id=product.id,
    )
    logger.info("Product text import started product=%s filename=%s import_id=%s", product.id, filename, import_id)
    try:
        if file is not None:
            content = await file.read()
            document_text = product_knowledge_service.parse_text_file(content)
            document_title = title or file.filename or "Text document"
        elif text:
            document_text = text
            document_title = title or "Text document"
        else:
            raise InputValidationError("Upload a text file or provide text form data.")

        documents = product_knowledge_service.build_documents(
            product=product,
            text=document_text,
            source_type="text",
            title=document_title,
            filename=filename,
        )
        indexed_count, job_id = await moss_service.add_documents(documents)
    except Exception as exc:
        import_tracker.fail(import_id, str(exc))
        logger.exception("Product text import failed product=%s filename=%s", product.id, filename)
        raise

    return _complete_import(
        import_id=import_id,
        product_id=product.id,
        documents=documents,
        indexed_count=indexed_count,
        job_id=job_id,
        message=f"Indexed {indexed_count} text knowledge chunks for {product.name}.",
    )


@router.post("/{product_id}/knowledge/url", response_model=ImportResponse)
async def upload_product_url(product_id: str, payload: UrlKnowledgeRequest) -> ImportResponse:
    product = product_store.get_product(product_id)
    import_id = import_tracker.start(
        source="product_url",
        index_name=moss_service.index_name,
        product_id=product.id,
    )
    url = str(payload.url)
    logger.info("Product URL import started product=%s url=%s import_id=%s", product.id, url, import_id)
    try:
        text = product_knowledge_service.fetch_url_text(url)
        documents = product_knowledge_service.build_documents(
            product=product,
            text=text,
            source_type="url",
            title=payload.title or url,
            url=url,
        )
        indexed_count, job_id = await moss_service.add_documents(documents)
    except Exception as exc:
        import_tracker.fail(import_id, str(exc))
        logger.exception("Product URL import failed product=%s url=%s", product.id, url)
        raise

    return _complete_import(
        import_id=import_id,
        product_id=product.id,
        documents=documents,
        indexed_count=indexed_count,
        job_id=job_id,
        message=f"Indexed {indexed_count} URL knowledge chunks for {product.name}.",
    )


@router.post("/{product_id}/diagnose", response_model=DiagnosticResponse)
async def diagnose_product(product_id: str, payload: DiagnosticRequest) -> DiagnosticResponse:
    product = product_store.get_product(product_id)
    return await diagnostic_service.diagnose(product=product, payload=payload)


def _complete_import(
    import_id: str,
    product_id: str,
    documents: list[KnowledgeDocument],
    indexed_count: int,
    job_id: str | None,
    message: str,
) -> ImportResponse:
    import_tracker.complete(
        import_id=import_id,
        documents=documents,
        indexed_count=indexed_count,
        job_id=job_id,
        message=message,
    )
    logger.info("Product knowledge import completed product=%s import_id=%s", product_id, import_id)
    return ImportResponse(
        imported_count=len(documents),
        indexed_count=indexed_count,
        index_name=moss_service.index_name,
        job_id=job_id,
        import_id=import_id,
        product_id=product_id,
        message=message,
    )
