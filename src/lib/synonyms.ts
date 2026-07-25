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
  // Identity documents
  [
    "passport", "passports", "nida", "national", "nationalid", "identity",
    "identification", "id", "visa", "visas", "immigration", "citizenship",
    "nationality",
  ],
  // Creation & attribution — who MADE / RAISED / OWNS a task
  [
    "made", "make", "makes", "making", "create", "created", "creates",
    "creating", "raise", "raised", "raises", "raising", "opened", "logged",
    "author", "authored", "set", "setup", "started", "initiated", "added",
    "assigned", "assign", "assignee", "assignees", "responsible", "accountable",
    "working", "handling", "handled", "owns", "owner", "delegated",
  ],
  // Status & progress
  [
    "status", "progress", "ongoing", "active", "started", "notstarted",
    "inprogress", "underreview", "review", "waiting", "waitingexternal",
    "blocked", "escalated", "completed", "complete", "done", "finished",
    "closed", "close", "stuck", "stalled", "moving", "state",
  ],
  // Priority & urgency
  [
    "priority", "priorities", "critical", "high", "medium", "low", "urgent",
    "urgency", "important", "importance", "top", "biggest", "worst", "pressing",
    "severe", "serious",
  ],
  // Superlatives & comparison
  [
    "most", "least", "top", "highest", "lowest", "best", "worst", "more",
    "fewer", "fewest", "greater", "smaller", "biggest", "smallest", "compare",
    "comparison", "compared", "versus", "vs", "against", "between", "difference",
    "differences", "differ", "rank", "ranking", "leader", "leaderboard",
  ],
  // Counts & totals
  [
    "many", "number", "numbers", "count", "counts", "total", "totals",
    "amount", "quantity", "sum", "tally", "howmany",
  ],
  // Updates, timeline & activity
  [
    "update", "updates", "updated", "comment", "comments", "commented", "note",
    "notes", "progress", "history", "timeline", "activity", "activities", "log",
    "logs", "latest", "recent", "recently", "change", "changed", "changes",
    "modified", "posted", "post", "feed", "trail",
  ],
  // Portal, roles & access
  [
    "portal", "portals", "staff", "manager", "managers", "director", "directors",
    "admin", "hr", "role", "roles", "access", "permission", "permissions",
    "login", "loggedin", "signin", "signedin", "signed", "capability",
    "capabilities", "rights", "allowed", "grant", "granted", "revoke", "revoked",
    "enable", "enabled", "disable", "disabled", "password", "passkey",
    "opened", "open", "opens", "usage", "used", "using", "use", "visit", "visits",
    "visited", "session", "sessions", "active", "inactive", "engagement",
    "engaged", "seen", "lastseen", "online", "interact", "interaction",
    "interactions", "mostused", "loggingin",
  ],
  // Announcements & notices
  [
    "announcement", "announcements", "announce", "announced", "notice",
    "notices", "noticeboard", "broadcast", "bulletin", "memo", "memos", "post",
    "posted", "publish", "published",
  ],
  // Events & calendar
  [
    "event", "events", "calendar", "schedule", "scheduled", "appointment",
    "appointments", "meeting", "meetings", "call", "calls", "session",
    "sessions", "invite", "invited", "invitation", "booking", "upcoming",
    "diary",
  ],
  // Reminders & outreach
  [
    "remind", "reminder", "reminders", "reminded", "chase", "chased", "nudge",
    "ping", "follow", "followup", "outreach", "message", "messages", "notify",
    "notification", "notifications", "email", "emails", "whatsapp", "sms",
    "contact", "reach", "send",
  ],
  // Onboarding / offboarding & HR lifecycle
  [
    "onboarding", "onboard", "onboarded", "offboarding", "offboard", "joiner",
    "joiners", "joined", "leaver", "leavers", "left", "probation", "probationary",
    "startdate", "start", "newhire", "newstaff", "resign", "resignation",
    "termination", "terminated", "dismissal",
  ],
  // Time windows
  [
    "today", "tomorrow", "yesterday", "week", "weekly", "weeks", "month",
    "monthly", "months", "quarter", "quarterly", "year", "yearly", "annual",
    "recent", "recently", "soon", "upcoming", "past", "latest", "now", "current",
    "currently", "thisweek", "thismonth",
  ],
  // Location & site
  [
    "site", "sites", "location", "locations", "branch", "branches", "office",
    "offices", "where", "based", "residence", "worksite", "posted", "region",
    "area", "place", "premises",
  ],
  // Companies & the portfolio
  [
    "company", "companies", "business", "businesses", "firm", "firms", "entity",
    "entities", "portfolio", "group", "organisation", "organization",
    "cocozuri", "chocolat", "darspices", "dar", "spices", "terra", "green",
    "oracle", "consultancy", "pes", "mes", "pamoja", "plus",
  ],
  // Performance, KPI & productivity
  [
    "performance", "performing", "productive", "productivity", "efficient",
    "efficiency", "effective", "output", "throughput", "kpi", "kpis", "target",
    "targets", "metric", "metrics", "goal", "goals", "objective", "objectives",
    "score", "scores", "rating", "ontime", "late", "delay", "delayed",
    "slippage", "slipping", "completion", "turnaround", "responsiveness",
  ],
  // Analysis, insight & reporting
  [
    "analyse", "analyze", "analysis", "insight", "insights", "summary",
    "summarise", "summarize", "overview", "report", "reports", "reporting",
    "breakdown", "trend", "trends", "pattern", "patterns", "anomaly",
    "anomalies", "explain", "diagnose", "evaluate", "assessment", "assess",
  ],
  // Presence, check-in & attendance detail
  [
    "present", "absent", "late", "checkin", "checkout", "clockin", "clockout",
    "here", "away", "remote", "wfh", "workfromhome", "onsite", "halfday",
    "attendance", "attended", "attend", "unwell", "dayoff", "timeoff",
  ],
  // Money, cost & spend
  [
    "cost", "costs", "expense", "expenses", "spend", "spending", "budget",
    "budgets", "invoice", "invoices", "bill", "bills", "billing", "amount",
    "amounts", "money", "value", "price", "pricing", "fee", "fees", "charge",
    "charges",
  ],
  // Per-company nickname aliases — TIGHT groups so a nickname reaches its own
  // company's stored name WITHOUT dragging in the other six. (The coarse group
  // above still lets a bare portfolio word touch every brand.)
  ["dar", "darspices", "spices"], // Dar Spices
  ["coco", "cocozuri", "chocolat", "chocolate"], // Cocozuri Chocolat
  ["terra", "terragreen", "green"], // Terra Green
  ["oracle", "consultancy", "oc"], // Oracle Consultancy
  ["pes", "pinnacle"], // PES Ltd
  ["mes", "mes"], // MES Ltd
  ["pamoja", "pamojaplus", "plus"], // Pamoja Plus
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
const MAX_TOKENS = 32;

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
