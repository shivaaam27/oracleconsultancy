-- Marketing, Phase 2: photography and the library.
--
-- ⚠️ THE FILES DO NOT TRAVEL THROUGH THE SERVER. The browser uploads straight
-- to storage on a short-lived signed URL and the server only ever sees the
-- PATH — the same route `documents` takes, for the same reason: a serverless
-- request body caps at 4.5 MB and a phone photo is bigger than that.

CREATE TABLE IF NOT EXISTS "mkt_shoots" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  -- A calendar day, like a stock day — not a timestamp.
  "on_date" date,
  "place" text,
  "photographer_id" integer,
  "company_id" integer,
  "client_id" integer,
  -- ⚠️ DID THE PEOPLE IN IT AGREE TO BE PHOTOGRAPHED? THREE-STATE: true, false,
  -- NULL = nobody has said. A photograph of an identifiable person is their
  -- personal information under Tanzania's data protection rules. One tick box
  -- now answers a hard question later; defaulting it to true would answer it
  -- wrongly and silently.
  "consent" boolean,
  "notes" text,
  "archived" boolean DEFAULT false NOT NULL,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mkt_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  -- ⚠️ THE PATH, NEVER A URL. A signed URL expires; an asset is looked at for
  -- years. Every screen mints a fresh link from this on read.
  "storage_path" text NOT NULL,
  "file_name" text NOT NULL,
  "mime" text,
  "bytes" integer,
  "kind" text DEFAULT 'photo' NOT NULL,
  "shoot_id" integer,
  "company_id" integer,
  "client_id" integer,
  "caption" text,
  -- Free text — product, person, place. Searched, not a taxonomy: a one-person
  -- operation should not have to maintain a tag list.
  "tags" text,
  "taken_on" date,
  "archived" boolean DEFAULT false NOT NULL,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ⚠️ THIS TABLE IS WHAT MAKES "NEVER USED" ANSWERABLE — the excess-images pile.
-- An asset with no row here has never been published, and that pile is where
-- next month's posts come from.
CREATE TABLE IF NOT EXISTS "mkt_post_assets" (
  "post_id" integer NOT NULL,
  "asset_id" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mkt_post_assets_pk" PRIMARY KEY ("post_id","asset_id")
);

DO $$ BEGIN
  ALTER TABLE "mkt_shoots" ADD CONSTRAINT "mkt_shoots_photographer_id_people_id_fk"
    FOREIGN KEY ("photographer_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_shoots" ADD CONSTRAINT "mkt_shoots_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_shoots" ADD CONSTRAINT "mkt_shoots_client_id_mkt_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."mkt_clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_assets" ADD CONSTRAINT "mkt_assets_shoot_id_mkt_shoots_id_fk"
    FOREIGN KEY ("shoot_id") REFERENCES "public"."mkt_shoots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_assets" ADD CONSTRAINT "mkt_assets_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_assets" ADD CONSTRAINT "mkt_assets_client_id_mkt_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."mkt_clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_post_assets" ADD CONSTRAINT "mkt_post_assets_post_id_mkt_posts_id_fk"
    FOREIGN KEY ("post_id") REFERENCES "public"."mkt_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ⚠️ RESTRICT, not cascade. An asset a post was made from cannot be deleted out
-- from under it — that would quietly rewrite what the post was.
DO $$ BEGIN
  ALTER TABLE "mkt_post_assets" ADD CONSTRAINT "mkt_post_assets_asset_id_mkt_assets_id_fk"
    FOREIGN KEY ("asset_id") REFERENCES "public"."mkt_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "mkt_shoots_date_idx" ON "mkt_shoots" ("on_date");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_assets_path_idx" ON "mkt_assets" ("storage_path");
CREATE INDEX IF NOT EXISTS "mkt_assets_shoot_idx" ON "mkt_assets" ("shoot_id");
CREATE INDEX IF NOT EXISTS "mkt_assets_company_idx" ON "mkt_assets" ("company_id");
CREATE INDEX IF NOT EXISTS "mkt_post_assets_asset_idx" ON "mkt_post_assets" ("asset_id");

-- ⚠️ Locked to the service role, like every other table here.
ALTER TABLE "mkt_shoots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mkt_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mkt_post_assets" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "mkt_shoots", "mkt_assets", "mkt_post_assets" FROM anon, authenticated;
GRANT ALL ON TABLE "mkt_shoots", "mkt_assets", "mkt_post_assets" TO service_role;
