-- MCP stage 3 — sign-in (OAuth 2.1).
--
-- The bearer key in mcp_keys stays: it is right for Claude Code on the laptop and
-- for the unattended jobs in stage 4, where nobody is awake to press "Approve".
-- These three tables are the authorization server behind the "Connect" button
-- that claude.ai and the phone require instead.
--
-- Codes and tokens are stored HASHED, never in the clear, exactly as mcp_keys is.

CREATE TABLE "mcp_oauth_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text,
	"client_name" text NOT NULL,
	"redirect_uris" text NOT NULL,
	"grant_types" text NOT NULL,
	"scope" text,
	"source" text DEFAULT 'dcr' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "mcp_oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"scope" text,
	"resource" text,
	"person_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mcp_oauth_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"access_hash" text NOT NULL,
	"refresh_hash" text,
	"client_id" text NOT NULL,
	"label" text NOT NULL,
	"person_id" integer,
	"scope" text,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mcp_oauth_tokens_access_hash_unique" UNIQUE("access_hash"),
	CONSTRAINT "mcp_oauth_tokens_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_oauth_codes_expires_idx" ON "mcp_oauth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mcp_oauth_tokens_person_idx" ON "mcp_oauth_tokens" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "mcp_oauth_tokens_client_idx" ON "mcp_oauth_tokens" USING btree ("client_id");
