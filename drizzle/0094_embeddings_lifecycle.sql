-- History-aware semantic index (S6+). The owner asked that archived/closed/
-- inactive records be KEPT searchable but LABELLED, not deleted. This adds a
-- `lifecycle` column ('active' | 'history') to the `embeddings` table and rewires
-- both write/read RPCs so a row's lifecycle is stored and can be filtered.
--
-- Hand-written (not drizzle-kit generated) like 0076/0077: the `embeddings` table
-- is accessed via supabase-js + these RPCs, NOT via Drizzle ORM, so schema.ts is
-- intentionally left untouched. Additive + idempotent (IF NOT EXISTS) for live-DB
-- drift safety. Existing rows default to 'active', so nothing changes until the
-- next reindex re-stamps history.
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "lifecycle" text NOT NULL DEFAULT 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_lifecycle_idx" ON "embeddings" ("lifecycle");
--> statement-breakpoint
-- replace_embeddings: now also stamps a lifecycle on every chunk it writes.
-- p_lifecycle defaults to 'active' so any caller not yet passing it is unchanged.
CREATE OR REPLACE FUNCTION replace_embeddings(p_source_type text, p_source_id bigint, p_content_hash text, p_chunks jsonb, p_lifecycle text DEFAULT 'active')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM embeddings WHERE source_type = p_source_type AND source_id = p_source_id;
  IF p_chunks IS NOT NULL AND jsonb_array_length(p_chunks) > 0 THEN
    INSERT INTO embeddings (source_type, source_id, chunk_index, content, content_hash, embedding, lifecycle, updated_at)
    SELECT p_source_type, p_source_id, (c->>'i')::int, c->>'content', p_content_hash, (c->>'e')::vector, coalesce(p_lifecycle, 'active'), now()
    FROM jsonb_array_elements(p_chunks) AS c;
  END IF;
END;
$$;
--> statement-breakpoint
-- hybrid_search: returns a `lifecycle` per parent and accepts `filter_lifecycle`
-- (NULL = all lifecycles; 'active' = current only; 'history' = past only). The
-- RETURNS TABLE shape changes (extra column), so the old signature is dropped
-- first — CREATE OR REPLACE cannot alter a function's return type. We drop BOTH
-- the pre-0094 7-arg form and any 8-arg form so re-running is safe.
DROP FUNCTION IF EXISTS hybrid_search(text, text, int, text[], float, float, int);
--> statement-breakpoint
DROP FUNCTION IF EXISTS hybrid_search(text, text, int, text[], text, float, float, int);
--> statement-breakpoint
CREATE FUNCTION hybrid_search(
  query_text text,
  query_embedding text,
  match_count int DEFAULT 12,
  filter_types text[] DEFAULT NULL,
  filter_lifecycle text DEFAULT 'active',
  full_text_weight float DEFAULT 1.0,
  semantic_weight float DEFAULT 1.0,
  rrf_k int DEFAULT 50
)
RETURNS TABLE (source_type text, source_id bigint, content text, lifecycle text, score double precision)
LANGUAGE sql
STABLE
AS $$
  WITH fts AS (
    SELECT e.source_type, e.source_id, e.content, e.lifecycle,
           row_number() OVER (ORDER BY ts_rank_cd(e.fts, websearch_to_tsquery('simple', query_text)) DESC) AS rank_ix
    FROM embeddings e
    WHERE query_text <> ''
      AND (filter_types IS NULL OR e.source_type = ANY(filter_types))
      AND (filter_lifecycle IS NULL OR e.lifecycle = filter_lifecycle)
      AND e.fts @@ websearch_to_tsquery('simple', query_text)
    ORDER BY rank_ix
    LIMIT match_count * 4
  ),
  sem AS (
    SELECT e.source_type, e.source_id, e.content, e.lifecycle,
           row_number() OVER (ORDER BY e.embedding <=> (query_embedding)::vector) AS rank_ix
    FROM embeddings e
    WHERE e.embedding IS NOT NULL
      AND query_embedding <> ''
      AND (filter_types IS NULL OR e.source_type = ANY(filter_types))
      AND (filter_lifecycle IS NULL OR e.lifecycle = filter_lifecycle)
    ORDER BY rank_ix
    LIMIT match_count * 4
  ),
  fused AS (
    SELECT coalesce(fts.source_type, sem.source_type) AS source_type,
           coalesce(fts.source_id, sem.source_id) AS source_id,
           coalesce(fts.content, sem.content) AS content,
           coalesce(fts.lifecycle, sem.lifecycle) AS lifecycle,
           coalesce(1.0 / (rrf_k + fts.rank_ix), 0.0) * full_text_weight
         + coalesce(1.0 / (rrf_k + sem.rank_ix), 0.0) * semantic_weight AS score
    FROM fts
    FULL OUTER JOIN sem
      ON fts.source_type = sem.source_type AND fts.source_id = sem.source_id AND fts.content = sem.content
  )
  SELECT source_type, source_id,
         (array_agg(content ORDER BY score DESC))[1] AS content,
         (array_agg(lifecycle ORDER BY score DESC))[1] AS lifecycle,
         max(score) AS score
  FROM fused
  GROUP BY source_type, source_id
  ORDER BY score DESC
  LIMIT match_count;
$$;
