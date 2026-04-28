"""
Phase 4 — resize Document.embedding from 1536 to 768 dimensions.

Why:
    We switched the embedding provider from OpenAI text-embedding-ada-002
    (1536 dims) to Vertex AI text-embedding-004 (768 dims). pgvector
    cannot coerce vectors of different dimensions inside a single column,
    so we drop the column and re-add it at the new dimension.

Trade-off:
    Any embeddings stored under the old shape are erased. Phase 2/3 wrote
    none in real environments, and the wdms_ai_pipeline reprocess_document
    management command can backfill if needed.

Index:
    pgvector requires the column to exist with the right dimensions before
    an IVFFlat index can be created. The index uses cosine_ops to match
    the search endpoint's CosineDistance ordering.
"""

import pgvector.django
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("wdms_documents", "0001_initial"),
    ]

    operations = [
        # 1. Drop and re-add the embedding column at the new dimension.
        # RemoveField + AddField is the only safe way: pgvector does not
        # support ALTER TYPE between vector dimensions on a column that
        # may already hold data.
        migrations.RemoveField(
            model_name="document",
            name="embedding",
        ),
        migrations.AddField(
            model_name="document",
            name="embedding",
            field=pgvector.django.VectorField(blank=True, dimensions=768, null=True),
        ),
        # 2. IVFFlat index for fast cosine-similarity ordering.
        # `lists=100` is a reasonable default for a small-to-mid corpus;
        # rule of thumb is sqrt(N) for big corpora.
        migrations.RunSQL(
            sql=(
                "CREATE INDEX IF NOT EXISTS documents_embedding_ivfflat_idx "
                "ON documents USING ivfflat (embedding vector_cosine_ops) "
                "WITH (lists = 100);"
            ),
            reverse_sql="DROP INDEX IF EXISTS documents_embedding_ivfflat_idx;",
        ),
    ]
