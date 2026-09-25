# Semantic search — setup and reference

Semantic search lets ORI **find things by meaning, not just matching words**
("who's behind on paperwork?" finds a task that says "documentation
outstanding"). It runs **entirely inside your own Supabase region** — no text
goes to an outside AI company for this. It is **off by default**, and everything
works without it: ORI and ⌘K use keyword + synonym search until you switch it on.

The database side (the `embeddings` table, pgvector, the search functions) is
already in place. What is left is three one-time steps, about ten minutes.

Your Supabase project ref is `eskboulvmsoqsyuxppaa` (it is also in
`NEXT_PUBLIC_SUPABASE_URL`).

## 1. Deploy the embedding function

A small Supabase Edge Function (`supabase/functions/embed`) turns text into
vectors with Supabase's built-in `gte-small` model — no API key, no outside
vendor. In a terminal in the project folder, one command at a time:

```
npx supabase login
npx supabase link --project-ref eskboulvmsoqsyuxppaa
npx supabase functions deploy embed
```

- `login` opens the browser to approve; come back when it says you are logged in.
- `link` asks for the **database password** (the one set when the Supabase
  project was created, not the Oracle sign-in). Nothing shows while you paste
  it — that is normal. Forgotten it? Reset it in the Supabase dashboard →
  Project settings → Database.
- `deploy` should end with "Deployed Function embed".

## 2. Switch it on

Settings → **AI & Voice** → *AI assistance* → **"Semantic search (ORI)"** → on,
then Save.

## 3. Fill the index

```
npm run db:embed-backfill
```

A few minutes. Safe to re-run at any time — unchanged items are skipped.

Any red error text at any step: stop, and hand it to Claude. Nothing here can
damage data, and leaving it half done just means Oracle keeps using keyword
search.

---

## How it works

- **What is indexed** — every type in `src/lib/search/entity-registry.ts`: tasks,
  notes, people, companies, vendors, assets, governance records
  (shareholders, owners, signatories, key persons) and risks. Files contribute
  only what you typed about them (title, type, issuer, reference, notes); the
  file itself is never read for search, and ⌘K finds files by plain text match.
- **Always fresh** — every create, edit and archive fires a per-write hook
  (`src/lib/search/index-hooks.ts` → `reindexEntity` / `removeEntityIndex`), except
  files. The nightly `/api/cron/reindex` (05:00 UTC) is the catch-all: it
  re-indexes changed rows, heals missed hooks and sweeps vectors of deleted rows.
  It does nothing while the switch is off.
- **History is kept** — an archived, closed or inactive record is re-stamped
  `history` (`embeddings.lifecycle`) rather than dropped. ORI searches current
  records by default; ⌘K has an "Include history" toggle; the `hybrid_search`
  function takes `filter_lifecycle` (`active` / `history` / all). Only
  hard-deleted rows lose their vectors.
- **Coverage self-audit** — `src/lib/search/coverage-audit.ts` compares what exists
  with what is indexed and flags gaps on the System status card (inert while
  the switch is off).
- **Adding a new record type** — add one `EntityDef` to the registry; indexing,
  the backfill, ⌘K and trace all follow from it.

## Good to know

- **Safe to switch off** at any time — search falls straight back to keyword +
  synonyms, and nothing is deleted.
- **English-strong.** `gte-small` reads English best. Swahili text is
  translated to English by the AI before embedding when AI is on
  (`src/lib/search/embeddings.ts`); keyword search still covers every language by
  literal match.
- **Cost:** nothing beyond your existing Supabase usage.
- **Privacy:** embedding happens inside your Supabase region. (The optional
  Swahili translation step does go through Gemini, like the rest of Oracle's AI.)
