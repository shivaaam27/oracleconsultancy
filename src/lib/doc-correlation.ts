// Client-safe, AI-free pure helpers for cross-document owner correlation and
// "same person spelled differently" matching. No server/DB imports — so these
// can be unit-tested in isolation and reused from anywhere. The DB lookups that
// USE these live in src/app/documents/actions.ts (correlateOwnerByIdentifiers,
// resolveEntity); this file only holds the deterministic string/number logic.
//
// Everything here is deliberately conservative: the goal is to resolve an owner
// MORE OFTEN before a document is quarantined, but NEVER to mis-merge two
// distinct entities. When in doubt these helpers return nothing / false.

// ── Phone numbers ───────────────────────────────────────────────────────────
// Tanzania mobiles are +255 7XX XXX XXX. The same number turns up written as
// "+255712345678", "255712345678", "0712 345 678" or "0712-345-678". Normalise
// every variant to its 9-digit national subscriber number (the part after the
// country/trunk prefix) so they all compare equal. Returns null when the run of
// digits can't be a TZ phone number, so we never coin a bogus key.
export function normalisePhone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  // Strip a leading country code (255) or international 00255, then a trunk 0.
  if (d.startsWith("00255")) d = d.slice(5);
  else if (d.startsWith("255")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.replace(/^0+/, "");
  // A TZ subscriber number is 9 digits (mobiles begin 6/7; landlines 2). Anything
  // outside 9–10 digits after trimming is almost certainly not a phone (it's a
  // TIN, a reference, an amount, an account) — leave it for the other matchers.
  if (d.length < 9 || d.length > 10) return null;
  // Keep the last 9 (handles a stray extra digit from an OCR smudge).
  return d.slice(-9);
}

// Pull every plausible phone number out of free text and return their canonical
// 9-digit keys (de-duplicated). Recognises +255 / 255 / 0 prefixes with spaces,
// dots or dashes between groups.
export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:\+?255|0)[\s.-]?\d(?:[\s.-]?\d){7,9}/g;
  for (const m of (text ?? "").match(re) ?? []) {
    const key = normalisePhone(m);
    if (key) out.add(key);
  }
  return [...out];
}

// ── Email addresses ─────────────────────────────────────────────────────────
export function extractEmails(text: string): string[] {
  const out = new Set<string>();
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  for (const m of (text ?? "").match(re) ?? []) out.add(m.toLowerCase());
  return [...out];
}

// ── Bank account numbers ────────────────────────────────────────────────────
// Two paths: (1) a number that is explicitly LABELLED as an account
// ("A/C No: 0123456789012", "Account Number 0150 1234 5678"), which is the
// strong signal; (2) a bare long digit run (10–20 digits) that looks like an
// account rather than a TIN/VRN (≤9) or a phone (≤10). We keep the labelled and
// the long-bare runs separate from the generic numeric tokens so an account is
// matched against accounts, not against a coincidentally-equal shorter number.
export function extractBankAccounts(text: string): string[] {
  const out = new Set<string>();
  const t = text ?? "";
  // Labelled: "A/C", "Account No", "Acc No", "Account Number" then the digits.
  const labelled = /\b(?:a\/c|acc(?:oun)?t)\.?\s*(?:no\.?|number|#)?\s*[:#]?\s*([\d][\d\s-]{6,24}\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = labelled.exec(t))) {
    const d = m[1].replace(/\D/g, "");
    if (d.length >= 8 && d.length <= 20) out.add(d);
  }
  // Bare long runs that are too long to be a TIN/VRN (9) or a TZ phone (≤10).
  for (const run of t.match(/\d[\d\s-]{9,22}\d/g) ?? []) {
    const d = run.replace(/\D/g, "");
    if (d.length >= 11 && d.length <= 20) out.add(d);
  }
  return [...out];
}

// ── Physical address lines ──────────────────────────────────────────────────
// Normalise an address to a comparison key: lowercase, common abbreviations
// expanded, punctuation dropped, whitespace collapsed. Returns null for lines
// too short/generic to safely correlate on (a one-word "Dar es Salaam" must not
// tie two unrelated companies together — require some specificity).
const ADDR_ABBR: Record<string, string> = {
  rd: "road", st: "street", ave: "avenue", av: "avenue",
  "p.o": "po", pobox: "po box", str: "street",
};
export function normaliseAddress(raw: string): string | null {
  let s = (raw ?? "").toLowerCase().replace(/&/g, " and ");
  s = s.replace(/[.,#/\\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.split(" ").map((w) => ADDR_ABBR[w] ?? w).join(" ").replace(/\s+/g, " ").trim();
  const words = s.split(" ").filter(Boolean);
  // Specificity guard: require at least 3 words AND a digit OR an explicit
  // "po box" / "plot" — i.e. an actual street/box line, not just a city name.
  const hasNumber = /\d/.test(s);
  const hasMarker = /\b(po box|plot|block|floor|house no|street|road|avenue)\b/.test(s);
  if (words.length < 3 || (!hasNumber && !hasMarker)) return null;
  return s;
}

// Pull candidate address lines from free text (split on newlines AND on commas
// for flattened PDFs) and normalise each, keeping only the specific ones.
export function extractAddresses(text: string): string[] {
  const out = new Set<string>();
  for (const line of (text ?? "").split(/[\r\n]+|(?:,\s)/)) {
    const key = normaliseAddress(line);
    if (key) out.add(key);
  }
  return [...out];
}

// ── Person name matching ("same person spelled differently") ────────────────
// Strip honorifics + non-letters, lowercase, split into name tokens.
const NAME_HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "eng", "hon", "sir", "madam", "mr.", "dr."]);
function nameTokens(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z\s.-]/g, " ")
    .split(/[\s.-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 1 && !NAME_HONORIFICS.has(w));
}

// Does an abbreviated token line up with a full one? An initial ("s", "j")
// matches any full word starting with that letter ("samir", "jayantilal").
function tokenAligns(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  return false;
}

/**
 * True when two names plausibly denote the SAME person, tolerating initials and
 * extra/missing middle names — e.g. "S. J. Manek" ~ "Samir Jayantilal Manek",
 * "Samir Manek" ~ "Samir J. Manek".
 *
 * THRESHOLD (deliberately conservative, to never merge two distinct people):
 *  - The surname (last token) must align on BOTH sides — an initial there is
 *    allowed only if the first names also align (so "S. Manek" still needs the
 *    given name to agree). This anchors the match on the family name.
 *  - The first/given token must align on both sides.
 *  - At least TWO tokens must align overall (one shared token — e.g. only the
 *    surname — is NOT enough; thousands of "…Manek" would collide otherwise).
 *  - Every token on the SHORTER name must find an aligning token on the longer
 *    one (no contradicting given name). The longer name may carry extra middle
 *    names the shorter one omits — that's expected, not a conflict.
 * Single-token inputs never match (one name is far too weak a signal).
 */
export function personNamesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  // Anchor on first + last tokens aligning on both sides.
  if (!tokenAligns(ta[0], tb[0])) return false;
  if (!tokenAligns(ta[ta.length - 1], tb[tb.length - 1])) return false;
  // Every token of the shorter name must find an aligning partner in the longer,
  // each partner used once (no double-counting one long token for two short ones).
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Array(long.length).fill(false);
  let aligned = 0;
  for (const s of short) {
    const i = long.findIndex((l, idx) => !used[idx] && tokenAligns(s, l));
    if (i === -1) return false; // a token with no partner = contradiction
    used[i] = true;
    aligned++;
  }
  return aligned >= 2;
}
