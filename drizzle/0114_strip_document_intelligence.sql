-- 0114_strip_document_intelligence.sql
--
-- Documents go back to being filed BY HAND (Aug 2026). This drops the whole
-- intake-intelligence layer and the required-document compliance engine:
--   • the compliance checklists (per person + per company) and their templates
--   • the learning loops (owner/routing corrections) and custom shelves
--   • the AI's profile suggestions and its extraction cache
--   • every intake column on `documents` (quarantine state, confidence,
--     dedup hash, renewal lineage, OCR body text…)
--   • the document vectors in `embeddings`
-- Full-text search over what the owner TYPES is kept — `content_tsv` is simply
-- rebuilt without the OCR body.

ALTER TABLE "company_requirements" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_shelves" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extraction_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "owner_corrections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person_requirements" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_suggestions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requirement_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requirement_profiles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routing_corrections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "company_requirements" CASCADE;--> statement-breakpoint
DROP TABLE "custom_shelves" CASCADE;--> statement-breakpoint
DROP TABLE "extraction_cache" CASCADE;--> statement-breakpoint
DROP TABLE "owner_corrections" CASCADE;--> statement-breakpoint
DROP TABLE "person_requirements" CASCADE;--> statement-breakpoint
DROP TABLE "profile_suggestions" CASCADE;--> statement-breakpoint
DROP TABLE "requirement_items" CASCADE;--> statement-breakpoint
DROP TABLE "requirement_profiles" CASCADE;--> statement-breakpoint
DROP TABLE "routing_corrections" CASCADE;--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_supersedes_id_documents_id_fk";
--> statement-breakpoint
DROP INDEX "documents_file_hash_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "documents_intake_state_idx";--> statement-breakpoint
-- `content_tsv` is a GENERATED column built partly from `extracted_text`, so it
-- (and its index) must go before that column can be dropped. Both come back
-- below, rebuilt from the fields the owner fills in.
DROP INDEX IF EXISTS "documents_content_tsv_idx";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "content_tsv";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "supersedes_id";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "review_status";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "needs_original";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "file_hash";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "vetted_at";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "compilation_id";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "page_range";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "expiry_kind";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "intake_state";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "intake_reason";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "confidence";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "trashed_at";--> statement-breakpoint
-- The OCR/typed body the AI read out of each file, and how it read it. These
-- columns were added by raw SQL (0101), so drizzle-kit can't see them.
ALTER TABLE "documents" DROP COLUMN IF EXISTS "extracted_text";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "text_source";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "extracted_text_at";--> statement-breakpoint
-- Full-text search, rebuilt over what the owner types: title, type, reference,
-- issuer, category and notes. No file body any more.
ALTER TABLE "documents"
  ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '') || ' ' ||
      coalesce(doc_type, '') || ' ' ||
      coalesce(reference_no, '') || ' ' ||
      coalesce(issuer, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(notes, '')
    )
  ) STORED;--> statement-breakpoint
CREATE INDEX "documents_content_tsv_idx" ON "documents" USING gin ("content_tsv");--> statement-breakpoint
-- The search RPC loses its body snippet and its intake_state filter (archived is
-- now the only lifecycle flag). OR semantics + ts_rank are unchanged.
CREATE OR REPLACE FUNCTION search_documents(
  p_query text,
  p_limit int DEFAULT 20,
  p_company_ids int[] DEFAULT NULL
)
RETURNS TABLE (
  id int,
  title text,
  category text,
  doc_type text,
  reference_no text,
  company_id int,
  person_id int,
  storage_path text,
  file_name text,
  expiry_date timestamptz,
  rank real,
  snippet text
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT nullif(
      replace(websearch_to_tsquery('simple', p_query)::text, ' & ', ' | '),
      ''
    )::tsquery AS tsq
  )
  SELECT
    d.id,
    d.title,
    d.category,
    d.doc_type,
    d.reference_no,
    d.company_id,
    d.person_id,
    d.storage_path,
    d.file_name,
    d.expiry_date,
    ts_rank(d.content_tsv, q.tsq) AS rank,
    ts_headline(
      'simple',
      coalesce(d.notes, d.title),
      q.tsq,
      'StartSel=«,StopSel=»,MaxWords=18,MinWords=6,MaxFragments=2,FragmentDelimiter= … '
    ) AS snippet
  FROM documents d, q
  WHERE q.tsq IS NOT NULL
    AND d.archived = false
    AND d.content_tsv @@ q.tsq
    AND (p_company_ids IS NULL OR d.company_id = ANY (p_company_ids))
  ORDER BY rank DESC, d.created_at DESC
  LIMIT greatest(1, least(p_limit, 50));
$$;--> statement-breakpoint
-- Documents are no longer semantically indexed: drop their vectors so ORI stops
-- returning stale document hits. Every other entity type keeps its index.
DELETE FROM "embeddings" WHERE "source_type" = 'document';
