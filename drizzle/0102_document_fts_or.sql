-- 0102_document_fts_or.sql
-- Make document full-text search forgiving for natural-language questions. The
-- 0101 function AND-ed every term (websearch default), so "gangadhar passport
-- number" missed a passport that didn't contain the word "number". This switches
-- to OR semantics — match ANY term — while ts_rank still floats the documents
-- that match the MOST terms to the top. websearch_to_tsquery still does all the
-- sanitising/quoting (no syntax errors), then we swap its '&' for '|'.
-- Idempotent (CREATE OR REPLACE).

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
      coalesce(d.extracted_text, d.title),
      q.tsq,
      'StartSel=«,StopSel=»,MaxWords=18,MinWords=6,MaxFragments=2,FragmentDelimiter= … '
    ) AS snippet
  FROM documents d, q
  WHERE q.tsq IS NOT NULL
    AND d.archived = false
    AND d.intake_state = 'filed'
    AND d.content_tsv @@ q.tsq
    AND (p_company_ids IS NULL OR d.company_id = ANY (p_company_ids))
  ORDER BY rank DESC, d.created_at DESC
  LIMIT greatest(1, least(p_limit, 50));
$$;
