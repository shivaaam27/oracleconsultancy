// ══════════════════════════════════════════════════════════════════════════════
// Smart Paraphraser — rule-based NLG (no AI/API required)
// Techniques: passive→active inversion, gerund→imperative, phrase compression,
// subject stripping, existential flattening, question→imperative, jargon→plain
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Phrase compression dictionary ─────────────────────────────────────────
// Longer phrases first so they match before sub-phrases
const PHRASE_MAP: [RegExp, string][] = [
  // Relationship / contact
  [/\bget in touch with\b/gi,               "contact"],
  [/\breach out to\b/gi,                    "contact"],
  [/\btouch base with\b/gi,                 "meet with"],
  [/\bcircle back (on|with|about)\b/gi,     "follow up on"],
  [/\bloop in\b/gi,                         "include"],
  [/\bcheck in (with|on)\b/gi,              "follow up with"],
  [/\bspeak (with|to)\b/gi,                 "call"],
  [/\btalk (with|to)\b/gi,                  "call"],
  [/\bhave a (call|chat|conversation|discussion|talk) (with|about|on|regarding)\b/gi, "discuss"],
  [/\bset up a (call|meeting|session) (with|about|on|regarding)\b/gi, "schedule meeting"],
  [/\bhave a meeting (with|about|on|regarding)\b/gi, "meet"],
  // Review / analysis
  [/\btake a (look|glance|peek) at\b/gi,    "review"],
  [/\bhave a (look|glance) at\b/gi,         "review"],
  [/\bgo (over|through)\b/gi,               "review"],
  [/\blook (over|through|into)\b/gi,        "review"],
  [/\bcheck (up )?on\b/gi,                  "follow up on"],
  // Resolution
  [/\bsort out\b/gi,                        "resolve"],
  [/\bwork out\b/gi,                        "resolve"],
  [/\bdeal with\b/gi,                       "handle"],
  [/\btake care of\b/gi,                    "handle"],
  [/\bfigure out\b/gi,                      "determine"],
  [/\bwork on\b/gi,                         "progress"],
  [/\bcome up with\b/gi,                    "prepare"],
  [/\bput together\b/gi,                    "prepare"],
  [/\bkeep an eye on\b/gi,                  "monitor"],
  [/\bkeep track of\b/gi,                   "track"],
  // Filler connectives
  [/\bin order to\b/gi,                     "to"],
  [/\bdue to the fact that\b/gi,            "because"],
  [/\bwith (regard|reference|respect) to\b/gi, "regarding"],
  [/\bin terms of\b/gi,                     "regarding"],
  [/\bfor the purpose of\b/gi,              "to"],
  [/\bon behalf of\b/gi,                    "for"],
  [/\bby means of\b/gi,                     "using"],
  [/\bin the event that\b/gi,               "if"],
  [/\bprior to\b/gi,                        "before"],
  [/\bsubsequent to\b/gi,                   "after"],
  [/\bat this point in time\b/gi,           "now"],
  [/\bon a (daily|weekly|monthly) basis\b/gi, "$1"],
  // Weak openers
  [/\bmake sure (that\s+)?(to\s+)?/gi,      ""],
  [/\bmake certain (that\s+)?/gi,           ""],
  [/\bensure (that\s+)?/gi,                 ""],
  [/\bit is (important|necessary|critical|essential) to\b/gi, ""],
  [/\bit would be (good|great|helpful|ideal|best) to\b/gi,    ""],
  [/\bwe (should|need to|must|have to|ought to)\b/gi,         ""],
  [/\bsomeone (should|needs to|must|has to)\b/gi,             ""],
  [/\bplease\s+/gi,                         ""],
  [/\bkindly\s+/gi,                         ""],
  // Verbal phrase gerunds
  [/\bgoing (over|through)\b/gi, "review"],
  [/\bsetting up\b/gi,           "set up"],
  [/\blooking (over|through|into)\b/gi, "review"],
  // Abbreviations — avoid \b after / (not a word char)
  [/\bw\//g,     "with "],
  [/\br\//g,     "regarding "],
  [/\bb\/w\b/gi, "between"],
  [/\basap\b/gi, ""],
  [/\bpls\b/gi,  ""],
  [/\bplz\b/gi,  ""],
  [/\bfyi:?\s*/gi, ""],
  [/\bbtw:?\s*/gi, ""],
  [/\bre:\s*/gi,  "regarding "],
  [/\bu\b/g,     "you"],
  // Follow-up normalisation
  [/\bfollow[\s-]?up\b/gi, "follow up"],
  [/\bfollowup\b/gi,       "follow up"],
];

// ── 2. Past participle → imperative (for passive voice inversion) ─────────────
const PP_TO_IMPERATIVE: Record<string, string> = {
  reviewed:"Review", sent:"Send", processed:"Process", submitted:"Submit",
  completed:"Complete", approved:"Approve", signed:"Sign", updated:"Update",
  checked:"Check", confirmed:"Confirm", prepared:"Prepare", scheduled:"Schedule",
  arranged:"Arrange", finalized:"Finalize", finalised:"Finalise", shared:"Share",
  delivered:"Deliver", resolved:"Resolve", fixed:"Fix", handled:"Handle",
  done:"Complete", drafted:"Draft", written:"Write", created:"Create",
  collected:"Collect", gathered:"Gather", verified:"Verify", tested:"Test",
  launched:"Launch", closed:"Close", escalated:"Escalate", investigated:"Investigate",
  reported:"Report", notified:"Notify", informed:"Inform", booked:"Book",
  hired:"Hire", paid:"Pay", invoiced:"Invoice", reminded:"Remind",
  requested:"Request", obtained:"Obtain", procured:"Procure", negotiated:"Negotiate",
  visited:"Visit", inspected:"Inspect", audited:"Audit", trained:"Train",
  assigned:"Assign", delegated:"Delegate", implemented:"Implement", deployed:"Deploy",
  tracked:"Track", monitored:"Monitor", contacted:"Contact", called:"Call",
  emailed:"Email", addressed:"Address", discussed:"Discuss", presented:"Present",
  coordinated:"Coordinate", raised:"Raise", actioned:"Action", followed:"Follow up",
  analyzed:"Analyze", analysed:"Analyse", assessed:"Assess", evaluated:"Evaluate",
  established:"Establish", executed:"Execute", facilitated:"Facilitate",
  initiated:"Initiate", maintained:"Maintain",
};

// ── 3. Gerund → imperative ────────────────────────────────────────────────────
const GERUND_TO_IMPERATIVE: Record<string, string> = {
  reviewing:"Review", sending:"Send", calling:"Call", following:"Follow up",
  updating:"Update", checking:"Check", preparing:"Prepare", scheduling:"Schedule",
  arranging:"Arrange", confirming:"Confirm", completing:"Complete",
  finalizing:"Finalize", finalising:"Finalise", sharing:"Share",
  presenting:"Present", delivering:"Deliver", discussing:"Discuss",
  resolving:"Resolve", fixing:"Fix", handling:"Handle", processing:"Process",
  approving:"Approve", signing:"Sign", drafting:"Draft", writing:"Write",
  creating:"Create", meeting:"Meet with", coordinating:"Coordinate",
  collecting:"Collect", gathering:"Gather", verifying:"Verify", testing:"Test",
  launching:"Launch", closing:"Close", escalating:"Escalate",
  investigating:"Investigate", reporting:"Report", notifying:"Notify",
  informing:"Inform", booking:"Book", hiring:"Hire", paying:"Pay",
  chasing:"Chase", reminding:"Remind", requesting:"Request", obtaining:"Obtain",
  procuring:"Procure", negotiating:"Negotiate", visiting:"Visit",
  inspecting:"Inspect", auditing:"Audit", training:"Train", assigning:"Assign",
  delegating:"Delegate", implementing:"Implement", deploying:"Deploy",
  tracking:"Track", monitoring:"Monitor", contacting:"Contact", emailing:"Email",
  addressing:"Address", submitting:"Submit", getting:"Get", making:"Make",
  raising:"Raise", analysing:"Analyse", analyzing:"Analyze", assessing:"Assess",
  evaluating:"Evaluate", establishing:"Establish", executing:"Execute",
  facilitating:"Facilitate", initiating:"Initiate", maintaining:"Maintain",
};

// ── 4. Structural transformers ────────────────────────────────────────────────

function stripTrailing(text: string): string {
  return text
    .replace(/[.!?]+$/, "")
    .replace(/\s+(asap|a\.s\.a\.p\.?|urgently|immediately|right\s+away|as\s+soon\s+as\s+possible)$/i, "")
    .replace(/\s+(please|kindly|thanks|thank\s+you|cheers)$/i, "")
    .trim();
}

function stripLeadingSubject(text: string): string {
  // Remove leading pronouns / subject phrases before a verb
  // "I will review..." → "review...", "John needs to send..." → "send..."
  let t = text;
  t = t.replace(/^(i|we|he|she|they|you|the team|our team|someone)\s+(will|should|shall|must|need to|needs to|have to|has to|would|can|could|ought to)\s+/i, "");
  t = t.replace(/^\w+\s+(will|should|shall|must|need to|needs to|have to|has to)\s+/i, "");
  t = t.replace(/^(i|we|he|she|they|you)\s+/i, "");
  return t;
}

function invertPassive(text: string): string {
  // "[Subject] needs to be [pp]" → "[Imperative] [subject]"
  // "[Subject] should be/must be/is to be [pp]" → "[Imperative] [subject]"
  const passiveRe = /^(.+?)\s+(needs? to be|should be|must be|has to be|is to be|is being|are being|was|were|will be|would be)\s+(\w+)(.*?)$/i;
  const m = text.match(passiveRe);
  if (m) {
    const subject = m[1].trim();
    const pp = m[3].toLowerCase();
    const rest = m[4].trim();
    const imperative = PP_TO_IMPERATIVE[pp];
    if (imperative) {
      // Clean up subject — remove leading articles
      const cleanSubject = subject.replace(/^(the|a|an)\s+/i, "");
      return `${imperative} ${cleanSubject}${rest ? " " + rest : ""}`.trim();
    }
  }

  // "is/are [pp] by..." — "the contract is reviewed by John" → "Review contract"
  const passiveBy = /^(?:the\s+|a\s+|an\s+)?(.+?)\s+(?:is|are|was|were)\s+(\w+ed|\w+t)\b(.*?)$/i;
  const m2 = text.match(passiveBy);
  if (m2) {
    const pp = m2[2].toLowerCase();
    const imperative = PP_TO_IMPERATIVE[pp];
    if (imperative) {
      const subject = m2[1].replace(/^(the|a|an)\s+/i, "");
      const rest = m2[3].replace(/\s+by\s+\w+/i, "").trim();
      return `${imperative} ${subject}${rest ? " " + rest : ""}`.trim();
    }
  }
  return text;
}

function handleQuestion(text: string): string {
  // "Can we/you/someone...?" → strip modal + subject
  const qRe = /^(can|could|would|should|shall|will|may|might)\s+(we|you|someone|i|he|she|they|the team)?\s*/i;
  return text.replace(qRe, "").trim();
}

function handleExistential(text: string): string {
  const existRe = /^there\s+(is|are|was|were)\s+(?:a\s+|an\s+|some\s+)?(?:\w+\s+)?(?:with|regarding|about|on|for)\s+(.+?)(?:\s+that\s+(.+))?$/i;
  const m = text.match(existRe);
  if (m) {
    const topic = m[2].replace(/^(the|a|an)\s+/i, "").trim();
    const action = m[3];
    if (action) {
      // "needs resolving" / "needs to be fixed" → extract the verb
      const cleaned = action
        .replace(/^needs?\s+(to\s+be\s+)?/i, "")
        .replace(/^requires?\s+/i, "")
        .trim();
      const imp = GERUND_TO_IMPERATIVE[cleaned.split(" ")[0].toLowerCase()];
      const verb = imp || PP_TO_IMPERATIVE[cleaned.split(" ")[0].toLowerCase()] || capitalise(cleaned);
      return `${verb} ${topic}`.trim();
    }
    return `Resolve ${topic} issue`.trim();
  }
  return text;
}

function convertGerund(text: string): string {
  // "[Verb-ing] [object]..." → "[Imperative] [object]..."
  const words = text.split(/\s+/);
  if (words.length > 1) {
    const first = words[0].toLowerCase();
    const imp = GERUND_TO_IMPERATIVE[first];
    if (imp) return [imp, ...words.slice(1)].join(" ");
  }
  return text;
}

function stripLeadingArticlesAndAdjectives(text: string): string {
  // Don't strip — keep nouns intact for readability
  return text;
}

function capitalise(text: string): string {
  if (!text) return text;
  // If ALL CAPS, convert to title-case-ish
  if (text === text.toUpperCase() && /[A-Z]{3,}/.test(text)) {
    text = text.toLowerCase();
  }
  return text[0].toUpperCase() + text.slice(1);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function polishActionItem(raw: string): string {
  if (!raw.trim()) return raw;
  let text = raw.trim();

  // Step 1 — phrase compression (run before structural transforms)
  for (const [re, rep] of PHRASE_MAP) text = text.replace(re, rep);
  text = text.replace(/\s{2,}/g, " ").trim();

  // Step 2 — handle questions ("Can we...?")
  if (/^(can|could|would|should|shall|will|may|might)\s/i.test(text)) {
    text = handleQuestion(text);
  }

  // Step 3 — handle existential ("There is an issue with...")
  if (/^there\s+(is|are|was|were)\s/i.test(text)) {
    text = handleExistential(text);
  }

  // Step 4 — strip bare leading modal/necessity FIRST ("need to", "must"...)
  // so that "need to we follow up" becomes "we follow up" before subject strip.
  text = text.replace(/^(need to|needs to|have to|has to|must|should|shall|will|would|can|could)\s+/i, "");
  text = text.replace(/^to\s+(?=[a-z])/i, "");

  // Step 5 — strip leading subject ("We will / John needs to / we follow up")
  text = stripLeadingSubject(text);

  // Re-strip modal in case subject-strip exposed another one
  text = text.replace(/^(need to|needs to|have to|has to|must|should|shall|will|would|can|could)\s+/i, "");
  text = text.replace(/^to\s+(?=[a-z])/i, "");

  // Step 6 — try passive→active inversion
  const inverted = invertPassive(text);
  if (inverted !== text) { text = inverted; }

  // Step 7 — convert leading gerund ("Reviewing..." → "Review...")
  text = convertGerund(text);

  // Step 8 — strip trailing noise
  text = stripTrailing(text);

  // Step 9 — clean double spaces
  text = text.replace(/\s{2,}/g, " ").trim();

  // Step 10 — capitalise
  if (!text) return raw.trim();
  text = capitalise(text);

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
