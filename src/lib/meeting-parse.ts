import { parseCapture, polishActionItem, type ParsedCapture } from "./smart-parse";

type Company = { id: number; name: string; code: string };
type Person  = { id: number; name: string };

// ── Action-verb seed list ──────────────────────────────────────────────────
const ACTION_VERBS = new Set([
  "review","send","call","email","contact","follow","followup","follow-up",
  "prepare","submit","check","update","schedule","arrange","confirm","complete",
  "finalize","finalise","share","present","deliver","discuss","resolve","fix",
  "handle","process","approve","sign","draft","write","create","setup","set up",
  "meet","coordinate","collect","gather","ensure","verify","test","launch",
  "close","escalate","investigate","analyse","analyze","report","notify",
  "inform","book","hire","onboard","pay","invoice","chase","remind","request",
  "obtain","procure","negotiate","visit","inspect","audit","train","assign",
  "delegate","implement","deploy","track","monitor","follow up","get",
  "make","move","push","raise","address","action",
]);

// Patterns that strongly indicate an action item line
const STRONG_PATTERNS: RegExp[] = [
  /^[-–—•*►▸◆]\s+.{8,}/,           // bullet point
  /^\d+[.)]\s+.{8,}/,               // numbered list
  /^(action|ai|todo|to-do|task)\s*[:–-]/i,  // explicit label
  /\baction\s+item\b/i,
  /\bto[\s-]do\b/i,
];

// Person-assignment patterns: "John to review...", "John will send..."
// built dynamically from people list
function buildAssignmentPatterns(people: Person[]): RegExp[] {
  return people.map(p => {
    const first = p.name.split(" ")[0];
    return new RegExp(`\\b${first}\\s+(to|will|should|must|needs to|has to)\\b`, "i");
  });
}

// Ownership phrases: "owner: john", "assigned to: sarah"
const OWNERSHIP_RE = /\b(owner|assigned to|responsible|accountable)\s*[:–-]\s*\w+/i;

// Deadline phrase presence
const DEADLINE_RE = /\b(by|before|due|deadline|end of (month|week|quarter)|next (week|month)|eom|eow|tomorrow|asap|urgent)\b/i;

function looksLikeActionItem(line: string, assignmentPatterns: RegExp[]): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 8) return false;

  // Strong signals
  for (const re of STRONG_PATTERNS) {
    if (re.test(trimmed)) return true;
  }

  // Person assignment patterns
  for (const re of assignmentPatterns) {
    if (re.test(trimmed)) return true;
  }

  // Ownership / deadline
  if (OWNERSHIP_RE.test(trimmed)) return true;
  if (DEADLINE_RE.test(trimmed)) return true;

  // Starts with an action verb (after stripping leading noise)
  const words = trimmed.toLowerCase().replace(/^[-•*\d.)\s]+/, "").split(/\s+/);
  if (words[0] && ACTION_VERBS.has(words[0])) return true;
  if (words[0] && words[1] && ACTION_VERBS.has(`${words[0]} ${words[1]}`)) return true;

  return false;
}

function stripBullet(line: string): string {
  return line
    .trim()
    .replace(/^[-–—•*►▸◆]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^(action|ai|todo|to-do|task)\s*[:–-]\s*/i, "")
    .trim();
}

// ── Main export ───────────────────────────────────────────────────────────

export type MeetingTask = ParsedCapture & { lineIndex: number; raw: string };

export function extractMeetingTasks(
  notes: string,
  companies: Company[],
  people: Person[],
  defaultCompanyId?: number,
): MeetingTask[] {
  const lines = notes.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  const assignmentPatterns = buildAssignmentPatterns(people);
  const results: MeetingTask[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!looksLikeActionItem(line, assignmentPatterns)) continue;

    const stripped = stripBullet(line);
    const parsed = parseCapture(stripped, companies, people);

    // If no company detected and a default is supplied, apply it
    if (!parsed.companyId && defaultCompanyId) {
      const co = companies.find(c => c.id === defaultCompanyId);
      if (co) {
        parsed.companyId = co.id;
        parsed.companyName = co.name;
      }
    }

    // Polish the action item
    parsed.actionItem = polishActionItem(parsed.actionItem);

    results.push({ ...parsed, lineIndex: i, raw: stripped });
  }

  return results;
}
