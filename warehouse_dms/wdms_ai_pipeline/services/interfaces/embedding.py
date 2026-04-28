"""
Embedding service interface.

All implementations must return a list of ``EMBEDDING_DIMENSIONS`` floats so
the pgvector ``Document.embedding`` column can store the result without a
dimension mismatch. The dimension is fixed by the production model
(text-embedding-004 → 768) and is not configurable per call.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

EMBEDDING_DIMENSIONS = 768


class EmbeddingServiceInterface(ABC):
    @abstractmethod
    def embed(self, text: str) -> List[float]:
        """Return a 768-dimensional embedding for ``text``."""
