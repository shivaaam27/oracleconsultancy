CREATE TABLE "site_tool_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tool_id" integer,
	"tool_name" text NOT NULL,
	"type" text NOT NULL,
	"quantity" integer,
	"from_location" text,
	"to_location" text,
	"from_condition" text,
	"to_condition" text,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_tool_movements" ADD CONSTRAINT "site_tool_movements_tool_id_site_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."site_tools"("id") ON DELETE set null ON UPDATE no action;