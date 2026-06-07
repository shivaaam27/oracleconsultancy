CREATE TABLE "person_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"item_id" integer,
	"label" text NOT NULL,
	"category" text,
	"mandatory" boolean DEFAULT true NOT NULL,
	"expiry_tracked" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'missing' NOT NULL,
	"document_id" integer,
	"requested_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"waived_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"label" text NOT NULL,
	"category" text,
	"mandatory" boolean DEFAULT true NOT NULL,
	"expiry_tracked" boolean DEFAULT true NOT NULL,
	"default_lead_days" integer DEFAULT 30 NOT NULL,
	"help_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"applies_to_type" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_requirements" ADD CONSTRAINT "person_requirements_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_requirements" ADD CONSTRAINT "person_requirements_item_id_requirement_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."requirement_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_requirements" ADD CONSTRAINT "person_requirements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_items" ADD CONSTRAINT "requirement_items_profile_id_requirement_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."requirement_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_requirements_person_item_idx" ON "person_requirements" USING btree ("person_id","item_id");