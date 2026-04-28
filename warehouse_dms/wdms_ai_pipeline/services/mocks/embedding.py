"""Offline embedding mock — deterministic, normalised, 768 dims."""

from __future__ import annotations

import hashlib
import math
import struct
from typing import List

from wdms_ai_pipeline.services.interfaces.embedding import (
    EMBEDDING_DIMENSIONS,
    EmbeddingServiceInterface,
)


class MockEmbeddingService(EmbeddingServiceInterface):
    def embed(self, text: str) -> List[float]:
        # Hash the text once and stretch the digest into a 768-float vector.
        # Identical text always produces the same vector, which makes mock
        # cosine-similarity behaviour predictable in tests.
        seed = hashlib.sha256((text or "").encode("utf-8")).digest()
        floats: List[float] = []
        i = 0
        while len(floats) < EMBEDDING_DIMENSIONS:
            chunk = hashlib.sha256(seed + struct.pack(">I", i)).digest()
            for off in range(0, len(chunk), 4):
                if len(floats) >= EMBEDDING_DIMENSIONS:
                    break
                # Map 4 bytes to a small signed float in roughly [-1, 1].
                n = struct.unpack(">I", chunk[off : off + 4])[0]
                floats.append(((n / 0xFFFFFFFF) * 2.0) - 1.0)
            i += 1
        # L2-normalise so cosine distance behaves like a unit-vector space.
        norm = math.sqrt(sum(f * f for f in floats)) or 1.0
        return [f / norm for f in floats]
