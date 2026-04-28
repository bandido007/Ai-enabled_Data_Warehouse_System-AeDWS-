"""
Service registry — singleton accessor for OCR / LLM / embedding services.

Reads ``USE_MOCK_AI_SERVICES`` from the environment. When true, every
consumer gets the offline mock implementations; otherwise the real Google
Cloud providers. The choice is made once per process so calls within a
single Celery worker stay consistent.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Optional

from wdms_ai_pipeline.services.interfaces.embedding import EmbeddingServiceInterface
from wdms_ai_pipeline.services.interfaces.llm import LLMServiceInterface
from wdms_ai_pipeline.services.interfaces.ocr import OCRServiceInterface

logger = logging.getLogger("wdms_logger")


@dataclass
class ServiceRegistry:
    ocr: OCRServiceInterface
    llm: LLMServiceInterface
    embedding: EmbeddingServiceInterface


_registry: Optional[ServiceRegistry] = None
_lock = threading.Lock()


def _truthy(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


def _build_registry() -> ServiceRegistry:
    use_mock = _truthy(os.environ.get("USE_MOCK_AI_SERVICES", "false"))

    if use_mock:
        from wdms_ai_pipeline.services.mocks.embedding import MockEmbeddingService
        from wdms_ai_pipeline.services.mocks.llm import MockLLMService
        from wdms_ai_pipeline.services.mocks.ocr import MockOCRService

        logger.info("AI service registry: USE_MOCK_AI_SERVICES=true → mock providers")
        return ServiceRegistry(
            ocr=MockOCRService(),
            llm=MockLLMService(),
            embedding=MockEmbeddingService(),
        )

    from wdms_ai_pipeline.services.providers.gemini_llm import GeminiLLMService
    from wdms_ai_pipeline.services.providers.vertex_embedding import VertexEmbeddingService
    from wdms_ai_pipeline.services.providers.vision_ocr import VisionOCRService

    logger.info("AI service registry: real Google Cloud providers")
    return ServiceRegistry(
        ocr=VisionOCRService(),
        llm=GeminiLLMService(),
        embedding=VertexEmbeddingService(),
    )


def get_service_registry() -> ServiceRegistry:
    """Return the process-wide singleton registry, building it on first use."""
    global _registry
    if _registry is not None:
        return _registry
    with _lock:
        if _registry is None:
            _registry = _build_registry()
    return _registry


def reset_service_registry() -> None:
    """Test hook — drop the cached registry so the next call rebuilds it."""
    global _registry
    with _lock:
        _registry = None
