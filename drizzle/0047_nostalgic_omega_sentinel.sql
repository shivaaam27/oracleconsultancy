CREATE TABLE "chat_message_mentions" (
	"message_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	CONSTRAINT "chat_message_mentions_message_id_person_id_pk" PRIMARY KEY("message_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"sender" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"attachments" text,
	"task_code" text,
	"created_at" timestamp with time zone NOT NULL,
	"edited_at" timestamp with time zone,
	"original_body" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_participants" (
	"thread_id" integer NOT NULL,
	"participant" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"last_read_at" timestamp with time zone,
	"muted_at" timestamp with time zone,
	CONSTRAINT "chat_participants_thread_id_participant_pk" PRIMARY KEY("thread_id","participant")
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'dm' NOT NULL,
	"title" text,
	"company_id" integer,
	"dm_key" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_threads_dm_key_idx" ON "chat_threads" USING btree ("dm_key");