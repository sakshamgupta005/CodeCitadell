from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from models.schemas import ErrorResponse, ImportStatusResponse
from routes import chat, products
from services.exceptions import AppError
from services.import_tracker import import_tracker


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Moss Product Support Platform API",
    description="Product support backend with Moss knowledge indexing, search, chat, and diagnostics.",
    version="0.1.0",
)


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    logger.warning("%s: %s", exc.error_type, exc.message)
    payload = ErrorResponse(detail=exc.message, error_type=exc.error_type)
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else {}
    location = ".".join(str(part) for part in first_error.get("loc", []) if part != "body")
    message = first_error.get("msg", "Invalid request.")
    detail = f"{location}: {message}" if location else message
    payload = ErrorResponse(detail=detail, error_type="validation_error")
    return JSONResponse(status_code=422, content=payload.model_dump())


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    payload = ErrorResponse(detail=str(exc.detail), error_type="http_error")
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled API error: %s", exc)
    payload = ErrorResponse(detail="Internal server error.", error_type="internal_server_error")
    return JSONResponse(status_code=500, content=payload.model_dump())


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    import inspect
    from services.moss_service import MossService
    print("--- ACTIVE MOSS SERVICE SOURCE ---")
    print(inspect.getsource(MossService.add_documents))
    print("----------------------------------")
    return {"status": "ok"}


@app.get("/import/status", response_model=ImportStatusResponse, tags=["imports"])
async def import_status() -> ImportStatusResponse:
    return ImportStatusResponse(
        active_imports=import_tracker.active_count(),
        last_import=import_tracker.last_import(),
        imports=import_tracker.list_imports(),
    )


app.include_router(products.router)
app.include_router(chat.router)
