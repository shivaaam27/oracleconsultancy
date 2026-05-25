// ── Polish / paraphrase ──────────────────────────────────────────────────────

const LEADING_FILLERS = [
  /^(please\s+|kindly\s+)/i,
  /^(we\s+need\s+to\s+|need\s+to\s+|i\s+need\s+to\s+|you\s+need\s+to\s+)/i,
  /^(they\s+need\s+to\s+|he\s+needs\s+to\s+|she\s+needs\s+to\s+)/i,
  /^(have\s+to\s+|has\s+to\s+|must\s+)/i,
  /^(should\s+|shall\s+|will\s+|can\s+you\s+|could\s+you\s+)/i,
  /^(make\s+sure\s+to\s+|make\s+sure\s+|ensure\s+that\s+|ensure\s+)/i,
  /^(remember\s+to\s+|don'?t\s+forget\s+to\s+)/i,
  /^to\s+(?=[a-z])/i,
];

const TRAILING_FILLERS = [
  /[.!?]+$/,
  /\s+(asap|a\.s\.a\.p\.?|urgently|immediately|right\s+away|as\s+soon\s+as\s+possible)$/i,
  /\s+(please|kindly|thanks|thank\s+you|cheers)$/i,
];

const REPLACEMENTS: [RegExp, string][] = [
  [/\bfollow[\s-]?up\b/gi, "Follow up on"],
  [/\bfollowup\b/gi, "Follow up on"],
  [/\basap\b/gi, ""],
  [/\bpls\b/gi, ""],
  [/\bplz\b/gi, ""],
  [/\bu\b/g, "you"],
  [/\bw\/\b/g, "with"],
  [/\br\/\b/g, "regarding"],
  [/\bre:\s*/i, "Regarding "],
  [/\bfyi:?\s*/i, ""],
  [/\s{2,}/g, " "],
];

export function polishActionItem(raw: string): string {
  if (!raw.trim()) return raw;
  let text = raw.trim();

  // Apply word replacements first
  for (const [re, rep] of REPLACEMENTS) text = text.replace(re, rep);

  // Strip leading filler phrases (run multiple passes — e.g. "please make sure to")
  let prev = "";
  while (prev !== text) {
    prev = text;
    for (const re of LEADING_FILLERS) text = text.replace(re, "");
    text = text.trimStart();
  }

  // Strip trailing filler
  for (const re of TRAILING_FILLERS) text = text.replace(re, "");
  text = text.trim();

  // Capitalise first letter, lowercase the rest if it was ALL CAPS
  if (!text) return raw.trim();
  const wasAllCaps = text === text.toUpperCase() && text.length > 3;
  if (wasAllCaps) text = text.toLowerCase();
  text = text[0].toUpperCase() + text.slice(1);

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────

export type ParsedCapture = {
  companyId: number | null;
  companyName: string | null;
  actionItem: string;
  priority: string;
  status: string;
  deadline: Date | null;
  deadlineLabel: string | null;
  assigneeNames: string[];
  category: string | null;
  escalation: string;
  risk: string | null;
  rawInput: string;
};

type Company = { id: number; name: string; code: string };
type Person = { id: number; name: string };

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function parseDeadline(text: string): { date: Date | null; label: string | null; phrases: string[] } {
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const phrases: string[] = [];

  if (/\beom\b|\bend of month\b/.test(lower)) {
    phrases.push("end of month", "eom");
    return { date: new Date(today.getFullYear(), today.getMonth() + 1, 0), label: "End of Month", phrases };
  }
  if (/\beow\b|\bend of week\b|\bthis friday\b/.test(lower)) {
    const d = new Date(today);
    const df = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + df);
    phrases.push("end of week", "eow", "this friday");
    return { date: d, label: "End of Week", phrases };
  }
  if (/\bnext week\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    phrases.push("next week");
    return { date: d, label: "Next Week", phrases };
  }
  if (/\bnext month\b/.test(lower)) {
    phrases.push("next month");
    return { date: new Date(today.getFullYear(), today.getMonth() + 1, 1), label: "Next Month", phrases };
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    phrases.push("tomorrow");
    return { date: d, label: "Tomorrow", phrases };
  }
  if (/\btoday\b/.test(lower)) {
    phrases.push("today");
    return { date: today, label: "Today", phrases };
  }

  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const mShort = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  for (let i = 0; i < months.length; i++) {
    const re = new RegExp(`\\b(?:by\\s+)?(?:${months[i]}|${mShort[i]})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`);
    const m = lower.match(re);
    if (m) {
      const day = parseInt(m[1], 10);
      const d = new Date(today.getFullYear(), i, day);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      phrases.push(m[0]);
      return { date: d, label: `${months[i][0].toUpperCase()}${months[i].slice(1)} ${day}`, phrases };
    }
  }

  const inD = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inD) {
    const d = new Date(today);
    d.setDate(d.getDate() + parseInt(inD[1], 10));
    phrases.push(inD[0]);
    return { date: d, label: `In ${inD[1]} days`, phrases };
  }
  const inW = lower.match(/\bin\s+(\d+)\s+weeks?\b/);
  if (inW) {
    const d = new Date(today);
    d.setDate(d.getDate() + parseInt(inW[1], 10) * 7);
    phrases.push(inW[0]);
    return { date: d, label: `In ${inW[1]} weeks`, phrases };
  }

  return { date: null, label: null, phrases: [] };
}

export function parseCapture(raw: string, companies: Company[], people: Person[]): ParsedCapture {
  const lower = norm(raw);
  const tokens = lower.split(/\s+/);

  // 1. Company
  let companyId: number | null = null;
  let companyName: string | null = null;
  const companyConsumed: string[] = [];

  for (const c of companies) {
    const cNorm = norm(c.name);
    const cWords = cNorm.split(/\s+/);
    const cCode = c.code.toLowerCase();
    if (lower.includes(cNorm)) {
      companyId = c.id; companyName = c.name;
      companyConsumed.push(c.name);
      break;
    }
    if (tokens.includes(cCode)) {
      companyId = c.id; companyName = c.name;
      companyConsumed.push(cCode);
      break;
    }
    if (cWords[0].length > 2 && tokens.includes(cWords[0])) {
      const ambiguous = companies.filter(x => norm(x.name).split(/\s+/)[0] === cWords[0]);
      if (ambiguous.length === 1) {
        companyId = c.id; companyName = c.name;
        companyConsumed.push(cWords[0]);
        break;
      }
    }
  }

  // 2. People
  const assigneeNames: string[] = [];
  const peopleConsumed: string[] = [];
  for (const p of people) {
    const pNorm = norm(p.name);
    const pWords = pNorm.split(/\s+/);
    if (lower.includes(pNorm)) {
      assigneeNames.push(p.name);
      peopleConsumed.push(p.name);
      continue;
    }
    const first = pWords[0];
    if (first.length > 2 && tokens.includes(first)) {
      const ambig = people.filter(x => norm(x.name).split(/\s+/)[0] === first);
      if (ambig.length === 1) {
        assigneeNames.push(p.name);
        peopleConsumed.push(first);
      }
    }
  }

  // 3. Priority
  let priority = "Low";
  const priPatterns: [RegExp, string][] = [
    [/\b(critical|p0)\b/, "Critical"],
    [/\b(urgent|asap|high priority|important|immediately|high)\b/, "High"],
    [/\b(medium|moderate|normal|p2|mid)\b/, "Medium"],
    [/\b(low|minor|p3|whenever)\b/, "Low"],
  ];
  const priConsumed: string[] = [];
  for (const [re, p] of priPatterns) {
    const m = lower.match(re);
    if (m) { priority = p; priConsumed.push(m[0]); break; }
  }

  // 4. Status
  let status = "Not Started";
  const statusPatterns: [RegExp, string][] = [
    [/\b(in progress|ongoing|started|working on|underway)\b/, "In Progress"],
    [/\b(blocked|stuck|on hold)\b/, "Blocked"],
    [/\b(waiting|waiting external|awaiting)\b/, "Waiting External"],
    [/\b(done|completed|finished|resolved|closed)\b/, "Completed"],
    [/\b(under review|reviewing)\b/, "Under Review"],
    [/\b(escalated|escalate)\b/, "Escalated"],
  ];
  const statusConsumed: string[] = [];
  for (const [re, s] of statusPatterns) {
    const m = lower.match(re);
    if (m) { status = s; statusConsumed.push(m[0]); break; }
  }

  // 5. Escalation
  const escalation = /\bescalat/.test(lower) || status === "Escalated" ? "Yes" : "No";

  // 6. Risk
  let risk: string | null = null;
  const riskConsumed: string[] = [];
  if (/\bhigh risk\b/.test(lower)) { risk = "High"; riskConsumed.push("high risk"); }
  else if (/\bmedium risk\b/.test(lower)) { risk = "Medium"; riskConsumed.push("medium risk"); }
  else if (/\blow risk\b/.test(lower)) { risk = "Low"; riskConsumed.push("low risk"); }
  else if (/\bat risk\b/.test(lower)) { risk = "High"; riskConsumed.push("at risk"); }

  // 7. Deadline
  const dl = parseDeadline(raw);

  // 8. Category
  let category: string | null = null;
  const catPatterns: [RegExp, string][] = [
    [/\b(finance|financial|payment|invoice|budget|accounting|cashflow|cash flow)\b/, "Finance"],
    [/\b(operations|ops|logistics|supply chain|procurement|vendor|packaging|production)\b/, "Operations"],
    [/\b(marketing|branding|campaign|social media|advertising|promo)\b/, "Marketing"],
    [/\b(hr|human resources|hiring|recruitment|staff|employee)\b/, "HR"],
    [/\b(legal|contract|compliance|regulatory|license|permit|agreement)\b/, "Legal"],
    [/\b(tech|technology|it|software|system|app|digital|website|platform)\b/, "Technology"],
    [/\b(sales|revenue|client|customer|deal|proposal|tender)\b/, "Sales"],
    [/\b(admin|administration|administrative|office|document|filing)\b/, "Admin"],
    [/\b(meeting|meetings|agenda|minutes|session)\b/, "Meetings"],
    [/\b(strategy|strategic|planning|plan|roadmap)\b/, "Strategy"],
  ];
  for (const [re, cat] of catPatterns) {
    if (re.test(lower)) { category = cat; break; }
  }

  // 9. Build action item by stripping detected entities from raw text
  let remaining = raw;
  const stripPatterns: RegExp[] = [
    ...companyConsumed.map(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")),
    ...peopleConsumed.map(s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")),
    ...dl.phrases.map(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")),
    ...priConsumed.map(s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")),
    ...statusConsumed.map(s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")),
    ...riskConsumed.map(s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")),
  ];
  for (const re of stripPatterns) remaining = remaining.replace(re, " ");
  remaining = remaining.replace(/\s+/g, " ").trim();
  if (remaining) remaining = remaining[0].toUpperCase() + remaining.slice(1);

  const actionItem = remaining.length > 3 ? remaining : raw.trim();

  return {
    companyId,
    companyName,
    actionItem,
    priority,
    status,
    deadline: dl.date,
    deadlineLabel: dl.label,
    assigneeNames,
    category,
    escalation,
    risk,
    rawInput: raw,
  };
}
