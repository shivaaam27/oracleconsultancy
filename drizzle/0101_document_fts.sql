-- 0101_document_fts.sql
-- Instant, Groq-FREE full-text search over the already-extracted document text.
-- A generated tsvector column (rebuilt automatically on every write) over the
-- title + type + reference + issuer + OCR/typed body, a GIN index, plus a scoped
-- search function that returns a relevance rank and a highlighted snippet.
-- 'simple' config = language-agnostic (good for names, reference numbers, and
-- mixed English/Swahili). Additive + idempotent (safe to re-run).

-- Trigram matching so a slightly mistyped filename/title still matches.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Generated full-text column. STORED + a constant 'simple' config keeps the
-- expression immutable (required for a generated column).
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce("title", '') || ' ' ||
      coalesce("doc_type", '') || ' ' ||
      coalesce("reference_no", '') || ' ' ||
      coalesce("issuer", '') || ' ' ||
      coalesce("extracted_text", '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "documents_content_tsv_idx" ON "documents" USING gin ("content_tsv");
CREATE INDEX IF NOT EXISTS "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);

-- Scoped full-text search. p_company_ids IS NULL → no company restriction (the
-- owner sees everything); a non-null array restricts to those companies (staff
-- scope is computed in app code from portal-auth and passed in). Returns a rank
-- and a highlighted snippet drawn from the document body.
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
    ts_rank(d.content_tsv, websearch_to_tsquery('simple', p_query)) AS rank,
    ts_headline(
      'simple',
      coalesce(d.extracted_text, d.title),
      websearch_to_tsquery('simple', p_query),
      'StartSel=«,StopSel=»,MaxWords=18,MinWords=6,MaxFragments=2,FragmentDelimiter= … '
    ) AS snippet
  FROM documents d
  WHERE d.archived = false
    AND d.intake_state = 'filed'
    AND d.content_tsv @@ websearch_to_tsquery('simple', p_query)
    AND (p_company_ids IS NULL OR d.company_id = ANY (p_company_ids))
  ORDER BY rank DESC, d.created_at DESC
  LIMIT greatest(1, least(p_limit, 50));
$$;
