CREATE TABLE "undo_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" text NOT NULL,
	"task_id" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp
);
