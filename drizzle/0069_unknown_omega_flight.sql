CREATE TABLE "announcement_receipts" (
	"announcement_id" integer NOT NULL,
	"recipient" text NOT NULL,
	"seen_at" timestamp with time zone,
	"ack_at" timestamp with time zone,
	CONSTRAINT "announcement_receipts_announcement_id_recipient_pk" PRIMARY KEY("announcement_id","recipient")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'operational' NOT NULL,
	"audience_kind" text DEFAULT 'all' NOT NULL,
	"audience_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"require_ack" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"author_person_id" integer,
	"created_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;