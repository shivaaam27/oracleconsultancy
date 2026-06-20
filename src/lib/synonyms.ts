// Shared "conversational synonym brain" for the whole COS system.
//
// Purpose: natural phrasing should resolve to the vocabulary actually stored in
// the database, across search, ORI Ask, and matching. When someone types "who
// owns Dar Spices?" the query should reach the stored terms "shareholder",
// "director", "captable", etc. — not just the literal word "owns".
//
// This is the broader, conversational sibling of `concept` in
// src/lib/requirement-match.ts (which is HR-document focused). Same semantics —
// a token from any group pulls in its whole group — but a wider vocabulary and a
// query-cleaning helper.
//
// Standalone and dependency-free: pure functions, server-safe, NO DB imports and
// NO import from requirement-match (the two modules stay independent on purpose).

// Conversational synonym groups covering the COS domain. If any token from a
// group is present, the whole group is added — so "owner" reaches "shareholder"
// and "director", "vendor" reaches "supplier" and "contractor", etc. Tokens are
// stored already-normalised (lowercase alphanumerics, accents stripped) so they
// compare directly against the output of `normaliseTokens`.
export const SYNONYM_GROUPS: string[][] = [
  // Ownership & governance
  [
    "owner", "owns", "owned", "ownership", "shareholder", "shareholders",
    "shareholding", "holder", "holders", "equity", "stake", "stakes", "shares",
    "share", "beneficial", "director", "directors", "directorship", "board",
    "signatory", "signatories", "captable", "capitalisation", "governance",
    "control", "controls", "controlled", "controlling", "runs", "run",
  ],
  // People & staff
  [
    "staff", "employee", "employees", "employment", "team", "teams", "person",
    "people", "worker", "workers", "colleague", "colleagues", "member",
    "members", "hire", "hires", "headcount", "personnel",
  ],
  // Suppliers & vendors
  [
    "vendor", "vendors", "supplier", "suppliers", "supply", "contractor",
    "contractors", "landlord", "landlords", "provider", "providers",
  ],
  // Finance & pay
  [
    "pay", "paid", "salary", "salaries", "wage", "wages", "payroll",
    "compensation", "remuneration", "earnings", "income", "stipend",
  ],
  // Property & premises
  [
    "rent", "rental", "lease", "leases", "tenancy", "tenant", "premises",
    "office", "offices", "landlord", "landlords", "property", "building",
  ],
  // Compliance, tax & legal
  [
    "permit", "permits", "licence", "licences", "license", "licenses",
    "registration", "registered", "certificate", "certificates", "tax",
    "taxes", "tin", "vrn", "vat", "nssf", "wcf", "paye", "sdl", "statutory",
    "compliance", "compliant", "legal", "regulatory", "brela",
  ],
  // Documents & files
  [
    "document", "documents", "file", "files", "attachment", "attachments",
    "scan", "scans", "copy", "copies", "paper", "papers", "record", "records",
    "upload", "uploads", "form", "forms",
  ],
  // Tasks & work
  [
    "task", "tasks", "todo", "todos", "action", "actions", "job", "jobs",
    "assignment", "assignments", "work", "deadline", "deadlines", "due",
    "overdue", "outstanding", "pending",
  ],
  // Meetings
  [
    "meeting", "meetings", "minutes", "minute", "note", "notes", "decision",
    "decisions", "agenda", "agendas", "attendee", "attendees", "discussion",
  ],
  // Risk
  [
    "risk", "risks", "threat", "threats", "exposure", "blocker", "blockers",
    "blocked", "issue", "issues", "hazard", "hazards", "concern", "concerns",
  ],
  // Leave & attendance (HR)
  [
    "leave", "holiday", "holidays", "absence", "absences", "absent", "annual",
    "sick", "sickness", "attendance", "attend", "off", "vacation",
    "compassionate", "maternity", "paternity",
  ],
  // Pipeline & applications
  [
    "application", "applications", "applied", "apply", "permit", "permits",
    "visa", "visas", "licence", "licences", "license", "progress", "inprogress",
    "pending", "control", "controlnumber",
  ],
  // Commitments & contracts
  [
    "commitment", "commitments", "contract", "contracts", "agreement",
    "agreements", "renewal", "renewals", "renew", "notice", "expiry",
    "expires", "expiring", "insurance", "policy", "cover",
  ],
  // Assets & equipment
  [
    "asset", "assets", "equipment", "device", "devices", "laptop", "laptops",
    "phone", "phones", "vehicle", "vehicles", "hardware", "machine",
    "machines", "tool", "tools",
  ],
  // Letters & correspondence
  [
    "letter", "letters", "invitation", "invitations", "correspondence",
    "notice", "notices", "memo", "memos",
  ],
  // Identity documents
  [
    "passport", "passports", "nida", "national", "nationalid", "identity",
    "identification", "id", "visa", "visas", "immigration", "citizenship",
    "nationality",
  ],
];

// Common words that carry no search signal — dropped from queries before
// expansion. Kept broad but conservative (only truly empty connectors and
// question words), so domain nouns are never accidentally removed.
const STOPWORDS = new Set([
  "the", "and", "for", "of", "a", "an", "to", "or", "with", "in", "on", "at",
  "by", "is", "are", "was", "were", "be", "been", "being", "as", "it", "its",
  "this", "that", "these", "those", "from", "into", "about", "who", "what",
  "which", "whom", "whose", "where", "when", "why", "how", "do", "does", "did",
  "has", "have", "had", "can", "could", "would", "should", "will", "shall",
  "any", "all", "some", "show", "find", "list", "get", "give", "tell", "me",
  "my", "our", "your", "their", "his", "her", "us", "we", "you", "they",
  "there", "here", "than", "then", "so", "but", "not", "no", "if",
]);

/**
 * Normalise a free-text string into a set of comparable tokens:
 * strip accents, lowercase, keep only alphanumerics + spaces, split, and drop
 * very short fragments. Mirrors `tokens` in requirement-match.ts.
 */
function normaliseTokens(s: string): Set<string> {
  return new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip accents: résumé → resume
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

/**
 * Expand a base token set by adding every synonym group that shares at least
 * one token with the base. Same semantics as `concept` in requirement-match.ts.
 */
export function expandTokens(base: Set<string>): Set<string> {
  const out = new Set(base);
  for (const group of SYNONYM_GROUPS) {
    if (group.some((g) => base.has(g))) for (const g of group) out.add(g);
  }
  return out;
}

// Maximum tokens returned from expandQuery — keeps downstream search/RAG
// prompts bounded even when a query touches several large synonym groups.
const MAX_TOKENS = 24;

/**
 * Turn a natural-language query into an expanded, de-duplicated token list:
 * lowercase → strip punctuation → split on whitespace → drop stopwords (length
 * < 3 OR a common word) → expand with synonyms → dedupe → cap at 24 tokens.
 */
export function expandQuery(q: string): string[] {
  const base = new Set<string>();
  for (const t of normaliseTokens(q)) {
    if (t.length < 3 || STOPWORDS.has(t)) continue;
    base.add(t);
  }
  const expanded = expandTokens(base);
  return Array.from(expanded).slice(0, MAX_TOKENS);
}
