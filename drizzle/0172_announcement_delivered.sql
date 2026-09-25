-- Scheduled announcements (26 Sept 2026): the push and the Outbox drafts went
-- out when Publish was pressed, even for a post timed for next week. They now go
-- at go-live; delivered_at records that they have. Additive.
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;
--> statement-breakpoint
-- Everything already published was delivered at the time — never send it again.
UPDATE "announcements" SET "delivered_at" = COALESCE("published_at", "created_at") WHERE "status" <> 'draft' AND "delivered_at" IS NULL;
