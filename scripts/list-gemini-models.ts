import { config } from "dotenv"; config({ path: ".env.local" });
async function run() {
  const { getGroqKey } = await import("@/lib/settings");
  const key = await getGroqKey();
  if (!key) { console.log("no key"); return; }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`);
  const d = await res.json().catch(() => ({}));
  const models = (d.models ?? []) as { name: string; supportedGenerationMethods?: string[] }[];
  const gen = models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /gemini|gemma/.test(n))
    .sort();
  console.log("status:", res.status, "count:", gen.length);
  for (const n of gen) console.log(" ", n);
}
run().catch((e) => console.log("FAIL " + e.message));
