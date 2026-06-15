-- Advanced semantic search S2/S3: chunk-level embeddings + full-text for hybrid
-- search. Additive + idempotent (IF NOT EXISTS). Existing rows get chunk_index 0
-- and an auto-generated fts vector, so they keep working until re-backfilled.
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "chunk_index" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
DROP INDEX IF EXISTS "embeddings_source_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "embeddings_source_chunk_idx" ON "embeddings" ("source_type", "source_id", "chunk_index");
--> statement-breakpoint
-- Full-text vector. 'simple' config = NO stemming, so non-English tokens
-- (Swahili/Hindi/Gujarati) and codes like DS-001 match literally. Pairs with the
-- vector half in hybrid_search() to cover what the English-only embedding misses.
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "fts" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_fts_idx" ON "embeddings" USING gin ("fts");
--> statement-breakpoint
-- Replace ALL chunks for one parent atomically (delete + insert from a jsonb
-- array of { i: chunk_index, content, e: embedding-as-text }).
CREATE OR REPLACE FUNCTION replace_embeddings(p_source_type text, p_source_id bigint, p_content_hash text, p_chunks jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM embeddings WHERE source_type = p_source_type AND source_id = p_source_id;
  IF p_chunks IS NOT NULL AND jsonb_array_length(p_chunks) > 0 THEN
    INSERT INTO embeddings (source_type, source_id, chunk_index, content, content_hash, embedding, updated_at)
    SELECT p_source_type, p_source_id, (c->>'i')::int, c->>'content', p_content_hash, (c->>'e')::vector, now()
    FROM jsonb_array_elements(p_chunks) AS c;
  END IF;
END;
$$;
--> statement-breakpoint
-- Hybrid search: full-text + vector, fused by Reciprocal Rank Fusion, rolled up
-- to the best-scoring chunk per parent.
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text text,
  query_embedding text,
  match_count int DEFAULT 12,
  filter_types text[] DEFAULT NULL,
  full_text_weight float DEFAULT 1.0,
  semantic_weight float DEFAULT 1.0,
  rrf_k int DEFAULT 50
)
RETURNS TABLE (source_type text, source_id bigint, content text, score double precision)
LANGUAGE sql
STABLE
AS $$
  WITH fts AS (
    SELECT e.source_type, e.source_id, e.content,
           row_number() OVER (ORDER BY ts_rank_cd(e.fts, websearch_to_tsquery('simple', query_text)) DESC) AS rank_ix
    FROM embeddings e
    WHERE query_text <> ''
      AND (filter_types IS NULL OR e.source_type = ANY(filter_types))
      AND e.fts @@ websearch_to_tsquery('simple', query_text)
    ORDER BY rank_ix
    LIMIT match_count * 4
  ),
  sem AS (
    SELECT e.source_type, e.source_id, e.content,
           row_number() OVER (ORDER BY e.embedding <=> (query_embedding)::vector) AS rank_ix
    FROM embeddings e
    WHERE e.embedding IS NOT NULL
      AND query_embedding <> ''
      AND (filter_types IS NULL OR e.source_type = ANY(filter_types))
    ORDER BY rank_ix
    LIMIT match_count * 4
  ),
  fused AS (
    SELECT coalesce(fts.source_type, sem.source_type) AS source_type,
           coalesce(fts.source_id, sem.source_id) AS source_id,
           coalesce(fts.content, sem.content) AS content,
           coalesce(1.0 / (rrf_k + fts.rank_ix), 0.0) * full_text_weight
         + coalesce(1.0 / (rrf_k + sem.rank_ix), 0.0) * semantic_weight AS score
    FROM fts
    FULL OUTER JOIN sem
      ON fts.source_type = sem.source_type AND fts.source_id = sem.source_id AND fts.content = sem.content
  )
  SELECT source_type, source_id,
         (array_agg(content ORDER BY score DESC))[1] AS content,
         max(score) AS score
  FROM fused
  GROUP BY source_type, source_id
  ORDER BY score DESC
  LIMIT match_count;
$$;
