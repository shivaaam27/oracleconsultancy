-- Phase 3b: in-region semantic search (pgvector + gte-small embeddings).
-- Hand-written (not drizzle-kit generated) to control the vector extension and
-- the HNSW operator class, and to stay IF NOT EXISTS for live-DB drift safety.
-- The `embeddings` table is accessed via supabase-js + the RPCs below, NOT via
-- Drizzle ORM, so schema.ts is intentionally left untouched.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	"source_type" text NOT NULL,
	"source_id" bigint NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(384),
	"updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "embeddings_source_idx" ON "embeddings" ("source_type", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_vec_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION upsert_embedding(p_source_type text, p_source_id bigint, p_content text, p_content_hash text, p_embedding text)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO embeddings (source_type, source_id, content, content_hash, embedding, updated_at)
  VALUES (p_source_type, p_source_id, p_content, p_content_hash, p_embedding::vector, now())
  ON CONFLICT (source_type, source_id)
  DO UPDATE SET content = EXCLUDED.content, content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding, updated_at = now();
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION match_embeddings(query_embedding text, match_count int, filter_types text[] DEFAULT NULL)
RETURNS TABLE (source_type text, source_id bigint, content text, similarity double precision)
LANGUAGE sql STABLE
AS $$
  SELECT e.source_type, e.source_id, e.content,
         1 - (e.embedding <=> (query_embedding::vector)) AS similarity
  FROM embeddings e
  WHERE e.embedding IS NOT NULL
    AND (filter_types IS NULL OR e.source_type = ANY(filter_types))
  ORDER BY e.embedding <=> (query_embedding::vector)
  LIMIT match_count;
$$;
