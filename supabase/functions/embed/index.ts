// Supabase Edge Function — in-region text embeddings.
//
// Runs Supabase's BUILT-IN `gte-small` model (384-dim) inside your Supabase
// project's own region. No external vendor, no API key, no extra cost: text
// never leaves your infrastructure. This is the engine behind COS semantic
// search (Phase 3b).
//
// Deploy once (Supabase CLI, from the project root):
//   supabase functions deploy embed
//
// The Next app calls it via supabase-js:
//   sb.functions.invoke("embed", { body: { input: "some text" } })
// and gets back { embedding: number[] }.
//
// This file runs on Deno in Supabase's Edge Runtime, NOT in the Next/Vercel
// build — it is excluded from the app's tsconfig, so the `Supabase`/`Deno`
// globals below are expected and fine.

// @ts-nocheck
const model = new Supabase.ai.Session("gte-small");

Deno.serve(async (req: Request) => {
  try {
    const { input } = await req.json();
    if (!input || typeof input !== "string") {
      return new Response(JSON.stringify({ error: "input (string) required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // mean_pool + normalize → the vectors are unit-length, so cosine distance
    // (the <=> operator we index on) is directly meaningful.
    const embedding = await model.run(input, { mean_pool: true, normalize: true });
    return new Response(JSON.stringify({ embedding }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
