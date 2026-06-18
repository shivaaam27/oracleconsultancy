# Phase 0 migration — `0086_even_stardust.sql` (apply guide)

This migration is **generated but NOT applied** to the live database. It is the
schema half of Phase 0 ERP hardening. Apply it deliberately, with a backup, after
the pre-flight cleanup below — several constraints will *fail to apply* if existing
live data has orphaned pointers or duplicate letter references.

## What it does

1. **`number_series` table** — atomic, gapless reference-number allocation
   (`UPDATE number_series SET next_val = next_val + 1 ... RETURNING` inside a
   transaction). Replaces the old `COUNT(*)+1` scheme. Used now by letters; the
   future invoice/PO/bill numbering will reuse it.
2. **Money columns → `numeric(14,2)`** — `assets.purchase_cost`,
   `stock_items.unit_cost`, `stock_purchases.unit_cost`. Exact decimals instead of
   floating-point. (These now return as strings in JS — the code already handles it.)
3. **6 foreign keys** — `people.manager_id`, `people.related_person_id`,
   `task_updates.parent_update_id`, `task_updates.attachment_document_id`,
   `notifications.thread_id`, `notifications.request_id`.
4. **`UNIQUE (letters.ref)`** — stops duplicate issued letter reference numbers.

## STEP 1 — Back up first (project rule)

```
npm run db:backup
```

Also confirm Supabase cloud backup / PITR is in place (see `BACKUP.md`).

## STEP 2 — Pre-flight: diagnose, then clean (run in Supabase SQL editor)

The `ADD CONSTRAINT` / `UNIQUE` / `ALTER TYPE` statements abort the whole migration
if they hit bad data. Check and fix BEFORE applying.

**a) Duplicate issued letter refs** (UNIQUE will fail):
```sql
SELECT ref, count(*) FROM letters WHERE ref IS NOT NULL GROUP BY ref HAVING count(*) > 1;
-- If any rows: re-stamp the later letter(s) to a free ref before applying.
-- (NULL/draft refs are fine — Postgres does not treat NULLs as equal.)
```

**b) Orphaned org pointers** (FK set-null will fail) — these are safe to run as-is;
they null pointers that reference a person/row that no longer exists:
```sql
UPDATE people SET manager_id = NULL
  WHERE manager_id IS NOT NULL AND manager_id NOT IN (SELECT id FROM people);
UPDATE people SET related_person_id = NULL
  WHERE related_person_id IS NOT NULL AND related_person_id NOT IN (SELECT id FROM people);
UPDATE task_updates SET parent_update_id = NULL
  WHERE parent_update_id IS NOT NULL AND parent_update_id NOT IN (SELECT id FROM task_updates);
UPDATE task_updates SET attachment_document_id = NULL
  WHERE attachment_document_id IS NOT NULL AND attachment_document_id NOT IN (SELECT id FROM documents);
```

**c) Orphaned notification links** (FK is `ON DELETE cascade`, so these must point at
real rows) — delete notifications that reference a deleted thread/request:
```sql
DELETE FROM notifications
  WHERE thread_id IS NOT NULL AND thread_id NOT IN (SELECT id FROM chat_threads);
DELETE FROM notifications
  WHERE request_id IS NOT NULL AND request_id NOT IN (SELECT id FROM requests);
```

**d) Money rounding note** — `doublePrecision → numeric(14,2)` rounds any value with
more than 2 decimal places. Spot-check `unit_cost` / `purchase_cost` look sane after
the backup.

## STEP 3 — Apply

```
npm run db:migrate
```

(Or apply `drizzle/0086_even_stardust.sql` via the Supabase SQL editor if you
prefer to watch each statement.)

## STEP 4 — Verify

- A test letter issues with a clean sequential ref and no collision after deleting a draft.
- Stock/asset cost figures still display correctly.
- App still loads (`npm run build` already passes on this branch).

## Rollback

Restore the pre-migration backup (`npm run db:restore -- <folder>`), or reverse the
DDL (drop the FKs/UNIQUE/table, set the money columns back to `double precision`).
