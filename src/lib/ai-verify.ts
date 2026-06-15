// ai-verify.ts — a cheap, deterministic check that AI-written prose did not
// invent a NAME or MONEY FIGURE that isn't in the source it was given.
//
// The meeting prose tools (minutes, decisions/risks, follow-up) save their output
// into the business record and feed the Ask COS context, but nothing verified the
// model obeyed its "do not invent names or amounts" instruction. This catches the
// obvious slips. It NEVER blocks — it only surfaces a "please confirm" flag, in
// keeping with the codebase's propose-then-approve pattern. No AI call, no deps.

export type ProseFlag = { kind: "name" | "money"; value: string };

// Words that are Title-Case in normal British prose but are NOT names — so we
// don't flag ordinary sentence starts, minutes headings, or e-mail sign-offs.
const NAME_STOP = new Set<string>([
  // headings / structure
  "summary", "decisions", "decision", "risks", "risk", "blockers", "blocker",
  "actions", "action", "items", "item", "follow", "followup", "next", "steps",
  "step", "notes", "minutes", "agenda", "attendees", "present", "apologies",
  "date", "time", "venue", "point", "points", "status", "plan", "plans",
  "task", "tasks", "deadline", "budget", "update", "updates", "total", "amount",
  // sentence-openers / function words
  "the", "this", "that", "these", "those", "they", "their", "them", "there",
  "we", "our", "us", "you", "your", "he", "she", "it", "his", "her",
  "a", "an", "and", "but", "or", "so", "if", "then", "also", "as", "at", "by",
  "for", "from", "in", "into", "of", "on", "to", "with", "will", "shall",
  "no", "not", "yes", "all", "any", "each", "per", "via", "regarding",
  // weekdays / months
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  // sign-offs / pleasantries (follow-up drafts)
  "dear", "hi", "hello", "best", "kind", "regards", "sincerely", "yours",
  "thanks", "thank", "attached", "please", "subject",
  // frequently-capitalised business words
  "company", "team", "board", "group", "ltd", "limited", "meeting", "project",
  "report", "invoice", "contract", "payment", "tax", "vat", "tin", "ceo", "cfo",
]);

/** The integer core of a money string, e.g. "TZS 5,000,000.00" → "5000000". */
function amountCore(s: string): string {
  const m = s.match(/\d[\d,]*(?:\.\d+)?/);
  if (!m) return "";
  const intPart = m[0].split(".")[0].replace(/[^\d]/g, "").replace(/^0+/, "");
  return intPart || (/\d/.test(m[0]) ? "0" : "");
}

/** Integer cores of every number in the source, for money comparison. */
function sourceNumberSet(source: string): Set<string> {
  const set = new Set<string>();
  for (const m of source.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const c = amountCore(m);
    if (c) set.add(c);
  }
  return set;
}

function moneyFlags(output: string, source: string): ProseFlag[] {
  const flags: ProseFlag[] = [];
  const seen = new Set<string>();
  const srcNums = sourceNumberSet(source);
  // currency-prefixed amount, grouped thousands, or a number + scale word.
  const re = /(?:TZS|TSH|TSh|USD|US\$|KES|EUR|GBP|\$|€|£)\s?[\d][\d,.]*|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s?(?:million|billion|m|bn|k)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output))) {
    const raw = m[0].trim();
    const core = amountCore(raw);
    if (!core || seen.has(core)) continue;
    seen.add(core);
    if (!srcNums.has(core)) flags.push({ kind: "money", value: raw });
    if (flags.length >= 4) break;
  }
  return flags;
}

function nameFlags(output: string, source: string, knownNames: string[]): ProseFlag[] {
  const flags: ProseFlag[] = [];
  const seen = new Set<string>();
  const srcLower = source.toLowerCase();
  const known = new Set(knownNames.map((n) => n.toLowerCase().trim()).filter(Boolean));
  // Only 2-3 capitalised words in a row — single capitalised words are too noisy
  // (every bullet/sentence starts with one), and the high-stakes case (a wrongly
  // attributed full name) is multi-word anyway.
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output))) {
    const phrase = m[1].trim();
    const lower = phrase.toLowerCase();
    if (seen.has(lower)) continue;
    const words = lower.split(/\s+/);
    if (words.every((w) => NAME_STOP.has(w))) continue;   // all structural words
    if (srcLower.includes(lower)) continue;               // it's in the notes
    if (known.has(lower)) continue;                       // a real company/person
    if ([...known].some((k) => k.includes(lower) || lower.includes(k))) continue;
    seen.add(lower);
    flags.push({ kind: "name", value: phrase });
    if (flags.length >= 4) break;
  }
  return flags;
}

/**
 * Returns flags for money figures and (multi-word) names that appear in `output`
 * but not in `source` (nor in the known company/people list). Empty = nothing to
 * confirm. Callers surface these as a gentle "check this" prompt; they never block.
 */
export function verifyProseAgainstSource(
  output: string,
  source: string,
  knownNames: string[] = [],
): ProseFlag[] {
  if (!output?.trim() || !source?.trim()) return [];
  return [...moneyFlags(output, source), ...nameFlags(output, source, knownNames)];
}

/** One-line summary of flags for a toast/banner, or "" when there are none. */
export function describeProseFlags(flags: ProseFlag[] | undefined): string {
  if (!flags?.length) return "";
  return ` ⚠ Check — not found in your notes: ${flags.map((f) => f.value).join(", ")}.`;
}
