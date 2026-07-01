import { sb } from "@/db/supabase";

/**
 * direct-answer.ts — instant, Groq-free "it just knows" answers for the command
 * palette. When a search reads like an entity+attribute lookup ("Gangadhar
 * passport", "Dar Spices TIN"), resolve it straight from the record and show the
 * VALUE at the top of results — no AI, no waiting. Returns null when the query
 * isn't a recognised attribute lookup, so normal search proceeds.
 */

export type DirectAnswer = {
  label: string;
  /** The value, or null when the attribute is genuinely blank on the record. */
  value: string | null;
  entity: string;
  entityType: "person" | "company";
  href: string;
};

type Attr = {
  test: RegExp;
  strip: RegExp;
  col: string;
  label: string;
  scope: "person" | "company" | "both";
  date?: boolean;
};

// Ordered: the first attribute whose `test` matches the query wins.
const ATTRS: Attr[] = [
  { test: /\bpassport\b/i, strip: /\bpassport(\s*(no|number))?\b/gi, col: "passport_no", label: "Passport no.", scope: "person" },
  { test: /\b(national\s*id|nida)\b/i, strip: /\b(national\s*id|nida)(\s*(no|number|card))?\b/gi, col: "national_id", label: "National ID", scope: "person" },
  { test: /\bnationality\b/i, strip: /\bnationality\b/gi, col: "nationality", label: "Nationality", scope: "person" },
  { test: /\b(date of birth|dob|birthday|born)\b/i, strip: /\b(date of birth|dob|birthday|born)\b/gi, col: "date_of_birth", label: "Date of birth", scope: "person", date: true },
  { test: /\b(role|position|job title)\b/i, strip: /\b(role|position|job title)\b/gi, col: "role", label: "Role", scope: "person" },
  { test: /\bvrn\b|\bvat (no|number)\b/i, strip: /\b(vrn|vat (no|number))\b/gi, col: "vrn", label: "VRN", scope: "company" },
  { test: /\btin\b|\btaxpayer\b/i, strip: /\b(tin|taxpayer(\s*id)?)\b/gi, col: "tin", label: "TIN", scope: "both" },
  { test: /\b(registration (no|number)|reg no|brela (no|number))\b/i, strip: /\b(registration (no|number)|reg no|brela (no|number)?)\b/gi, col: "registration_no", label: "Registration no.", scope: "company" },
  { test: /\bemail\b/i, strip: /\b(email|e-mail)(\s*address)?\b/gi, col: "email", label: "Email", scope: "both" },
  { test: /\b(phone|mobile|contact number)\b/i, strip: /\b(phone|mobile|contact number|number)\b/gi, col: "phone", label: "Phone", scope: "both" },
  { test: /\baddress\b/i, strip: /\baddress\b/gi, col: "address", label: "Address", scope: "both" },
];

// Filler words removed before matching the remainder against entity names.
const FILLER = /\b(what|whats|what's|is|are|the|of|for|show|me|tell|find|give|does|do|have|has|a|an|his|her|their|s)\b/gi;

function nameScore(name: string, tokens: string[]): number {
  const n = name.toLowerCase();
  let s = 0;
  for (const t of tokens) if (n.includes(t)) s += t.length; // longer, more specific match wins
  return s;
}

export async function resolveDirectAnswer(query: string): Promise<DirectAnswer | null> {
  const q = (query ?? "").toLowerCase().trim();
  if (q.length < 3) return null;
  const attr = ATTRS.find((a) => a.test.test(q));
  if (!attr) return null;

  // Isolate the entity name: drop the attribute words + filler.
  const nameQ = q.replace(attr.strip, " ").replace(FILLER, " ").replace(/[^a-z0-9 ]/g, " ").trim();
  const tokens = nameQ.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;

  type Cand = { type: "person" | "company"; id: number; name: string; value: string | null; score: number };
  let best: Cand | null = null;
  const consider = (c: Cand) => { if (c.score > 0 && (!best || c.score > best.score)) best = c; };

  if (attr.scope === "person" || attr.scope === "both") {
    const { data } = await sb.from("people").select(`id,name,${attr.col}`).eq("active", true);
    for (const p of (data ?? []) as unknown as Record<string, unknown>[]) {
      consider({ type: "person", id: p.id as number, name: p.name as string, value: (p[attr.col] as string | null) ?? null, score: nameScore(p.name as string, tokens) });
    }
  }
  if (attr.scope === "company" || attr.scope === "both") {
    // Match the brand `file_prefix` too ("DarSpices") — the DB `name` is the legal
    // name ("DSC Ltd"), so "Dar Spices VRN" resolves via the prefix.
    const { data } = await sb.from("companies").select(`id,name,file_prefix,${attr.col}`).eq("active", true);
    for (const c of (data ?? []) as unknown as Record<string, unknown>[]) {
      const matchText = `${c.name as string} ${(c.file_prefix as string | null) ?? ""}`;
      consider({ type: "company", id: c.id as number, name: c.name as string, value: (c[attr.col] as string | null) ?? null, score: nameScore(matchText, tokens) });
    }
  }
  if (!best) return null;
  const b: Cand = best;

  const value = attr.date && b.value ? new Date(b.value).toISOString().slice(0, 10) : b.value;
  return {
    label: attr.label,
    value: value || null,
    entity: b.name,
    entityType: b.type,
    href: b.type === "person" ? `/people?person=${b.id}` : `/companies/${b.id}`,
  };
}
