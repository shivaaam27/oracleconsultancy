CREATE TABLE "journey_step_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"applies_to_type" text NOT NULL,
	"label" text NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
