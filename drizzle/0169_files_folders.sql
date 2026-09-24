-- Files Management (24 Sept 2026). The owner's library had no folders — company
-- and category were the only structure. This adds real folders, the Deleted
-- area (30 days, then gone), stars and file sizes, and files the 197 existing
-- files into folders: a folder per company with a folder per category inside,
-- and "Staff papers" with a folder per person. Nothing is renamed or removed.

CREATE TABLE IF NOT EXISTS "folders" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "parent_id" integer REFERENCES "folders"("id") ON DELETE CASCADE,
  "color" text NOT NULL DEFAULT 'black',
  "company_id" integer REFERENCES "companies"("id") ON DELETE SET NULL,
  "person_id" integer REFERENCES "people"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" text NOT NULL DEFAULT 'web-ui',
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "folders_parent_idx" ON "folders" ("parent_id");

-- Locked like every other table (0139/0140): COS reaches it only through the
-- service role and postgres, both of which bypass RLS.
ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "folders" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "folders_id_seq" FROM anon, authenticated;

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "folder_id" integer REFERENCES "folders"("id") ON DELETE SET NULL;
-- Deleted = archived AND deleted_at set. Every reader already skips archived
-- files, so a deleted file disappears everywhere without touching them.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "starred" boolean NOT NULL DEFAULT false;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_size" bigint;
CREATE INDEX IF NOT EXISTS "documents_folder_idx" ON "documents" ("folder_id");

-- Sizes of what is already stored.
UPDATE "documents" d SET "file_size" = (o.metadata->>'size')::bigint
FROM storage.objects o
WHERE o.bucket_id = 'documents' AND o.name = d.storage_path AND d.file_size IS NULL;

-- File the existing library — once only (skipped if any folder exists).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "folders") THEN
    INSERT INTO "folders" ("name", "color", "company_id", "created_by")
    SELECT c.name, 'black', c.id, 'files-setup' FROM "companies" c
    WHERE EXISTS (SELECT 1 FROM "documents" d WHERE d.company_id = c.id)
    ORDER BY c.name;

    INSERT INTO "folders" ("name", "parent_id", "color", "company_id", "created_by")
    SELECT DISTINCT COALESCE(NULLIF(TRIM(d.category), ''), 'Other'), f.id, 'black', f.company_id, 'files-setup'
    FROM "documents" d JOIN "folders" f ON f.company_id = d.company_id AND f.parent_id IS NULL;

    INSERT INTO "folders" ("name", "color", "created_by") VALUES ('Staff papers', 'blue', 'files-setup');
    INSERT INTO "folders" ("name", "parent_id", "color", "person_id", "created_by")
    SELECT p.name, s.id, 'blue', p.id, 'files-setup'
    FROM "people" p CROSS JOIN "folders" s
    WHERE s.name = 'Staff papers' AND s.parent_id IS NULL
      AND EXISTS (SELECT 1 FROM "documents" d WHERE d.person_id = p.id AND d.company_id IS NULL);

    UPDATE "documents" d SET "folder_id" = sub.id
    FROM "folders" top JOIN "folders" sub ON sub.parent_id = top.id
    WHERE top.parent_id IS NULL AND top.company_id = d.company_id
      AND sub.name = COALESCE(NULLIF(TRIM(d.category), ''), 'Other') AND d.folder_id IS NULL;

    UPDATE "documents" d SET "folder_id" = f.id
    FROM "folders" f
    WHERE f.person_id = d.person_id AND d.company_id IS NULL AND d.folder_id IS NULL;
  END IF;
END $$;
