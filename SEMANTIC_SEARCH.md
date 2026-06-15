# Semantic search (Ask COS) — one-time setup

Semantic search lets **Ask COS find things by meaning, not just matching words**
("who's behind on paperwork?" finds tasks that say "documentation outstanding").
It runs **entirely in your own Supabase region** — no text is sent to any outside
AI company. It's **off by default** and the whole system works without it (Ask COS
uses keyword + synonym search until you switch it on), so there's no rush and
nothing breaks if you never do this.

When you're ready, it's four one-time steps. Steps 1–3 are technical; if you'd
rather, hand this file to whoever manages the Supabase project.

## 1. Take a backup, then apply the database change
The migration adds an `embeddings` table + the `vector` (pgvector) extension.
```
npm run db:backup        # safety snapshot first
npm run db:migrate       # applies migration 0076 (also runs automatically on your next deploy)
```

## 2. Deploy the embedding function (the in-region model)
This deploys a tiny Supabase function that turns text into vectors using
Supabase's built-in `gte-small` model — no API key, no external vendor.
```
npm i -g supabase                         # install the Supabase CLI (one time)
supabase login                            # opens your browser to authorise
supabase link --project-ref <your-ref>    # the ref from your Supabase dashboard URL
supabase functions deploy embed           # deploys supabase/functions/embed
```

## 3. Index your existing data
```
npm run db:embed-backfill
```
Embeds every existing task and meeting (a couple of minutes). Re-run it any time —
unchanged items are skipped. New tasks/meetings index themselves automatically once
step 4 is on.

## 4. Turn it on
**Settings → AI assistance → "Semantic search (Ask COS)"**. From now on Ask COS
blends meaning-based results with its keyword search.

---

### Good to know
- **Safe to switch off** any time — Ask COS instantly falls back to keyword + synonym
  search. Switching off doesn't delete anything; the embeddings just stop being used.
- **English-strong.** The built-in model reads English best; Swahili/Hindi/Gujarati text
  is embedded weakly, but keyword search still covers those by literal match. A fully
  multilingual in-region model is too heavy for the current hosting, so this is the
  trade-off of staying in-region and free.
- **What's indexed:** task action items (+ latest update) and meeting titles/notes/minutes.
  Documents already get strong keyword coverage; they can be added to semantic search later.
- **Cost:** none beyond your existing Supabase usage — the model runs on your own project.
- **Privacy:** text is embedded inside your Supabase region only; nothing goes to Groq or
  any other outside processor for this feature.
