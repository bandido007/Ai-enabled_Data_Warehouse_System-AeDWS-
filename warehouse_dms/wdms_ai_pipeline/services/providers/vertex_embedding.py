"""
Vertex AI text-embedding-004 provider.

Returns a 768-dimensional embedding. Quota errors propagate as
``google.api_core.exceptions.ResourceExhausted`` so the calling Celery task
can retry with exponential backoff.
"""

from __future__ import annotations

import os
from typing import List

from wdms_ai_pipeline.services.interfaces.embedding import (
    EMBEDDING_DIMENSIONS,
    EmbeddingServiceInterface,
)


# Vertex's TextEmbeddingInput accepts a ``task_type`` hint. Documents we
# embed are stored for retrieval, so we use the "RETRIEVAL_DOCUMENT" task.
_DEFAULT_TASK = "RETRIEVAL_DOCUMENT"


class VertexEmbeddingService(EmbeddingServiceInterface):
    def __init__(self):
        import vertexai  # type: ignore
        from vertexai.language_models import TextEmbeddingModel  # type: ignore

        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
        if not project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set")
        vertexai.init(project=project, location=location)
        self._TextEmbeddingModel = TextEmbeddingModel
        self._model_name = os.environ.get("VERTEX_EMBEDDING_MODEL", "text-embedding-004")
        self._model = TextEmbeddingModel.from_pretrained(self._model_name)

    def embed(self, text: str) -> List[float]:
        from vertexai.language_models import TextEmbeddingInput  # type: ignore

        # Vertex caps inputs at ~3072 tokens; truncate aggressively in chars to stay safe.
        clean = (text or "").strip()[:8000] or " "
        request = TextEmbeddingInput(text=clean, task_type=_DEFAULT_TASK)
        result = self._model.get_embeddings([request])
        if not result:
            raise RuntimeError("Vertex returned no embedding")
        values = list(result[0].values)
        if len(values) != EMBEDDING_DIMENSIONS:
            raise RuntimeError(
                f"Expected {EMBEDDING_DIMENSIONS}-dim embedding, got {len(values)}"
            )
        return values
