import { sb } from "@/db/supabase";
import { bestDocType, deriveFiling } from "@/lib/doc-catalog";
import { getAllTasks } from "@/lib/queries";
import { computeWorkload } from "@/lib/workload";

/**
 * smart-answer.ts — natural-language INSTANT answers for the command palette,
 * with NO AI and no waiting. Everything is indexed, so the common operational
 * questions ("who's on leave", "documents expiring this month", "expired
 * permits", "MES overdue tasks", "Dar Spices missing documents", "how many
 * staff") are answered as a complete, structured card straight from the DB.
 *
 * This is the deterministic sibling of direct-answer.ts (single-value lookups):
 * smart-answer returns a LIST card. Returns null when nothing matches, so normal
 * search proceeds. Best-effort throughout — a failed query yields null, never an
 * error, so search never breaks.
 */

export type SmartTone = "danger" | "warn" | "success" | "muted" | "accent";
export type SmartRow = { label: string; sub?: string | null; badge?: string | null; tone?: SmartTone; href: string };
export type SmartAnswer = {
  kind: "leave" | "expiry" | "expired" | "tasks" | "compliance" | "count";
  title: string;
  count: number;
  rows: SmartRow[];
  /** "See all" target when the list is capped. */
  href?: string;
  /** Small note under the title (e.g. the date window). */
  note?: string;
};

const MAX_ROWS = 8;
const day = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Match a PERSON named in the query to their id (any name part ≥3 chars). */
async function matchPerson(q: string): Promise<{ id: number; name: string } | null> {
  const { data } = await sb.from("people").select("id,name").eq("active", true);
  const lower = ` ${q.toLowerCase()} `;
  let best: { id: number; name: string; len: number } | null = null;
  for (const p of (data ?? []) as Record<string, unknown>[]) {
    for (const part of String(p.name ?? "").toLowerCase().split(/\s+/)) {
      if (part.length >= 3 && lower.includes(` ${part} `) && (!best || part.length > best.len)) {
        best = { id: p.id as number, name: p.name as string, len: part.length };
      }
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}

/** Match a company named in the query (name / legal name / alias). Uses WORD
 *  boundaries and skips <3-char codes, so a 2-letter code like "OC" can't match
 *  inside "d[oc]uments"; longest match wins. Aliases catch "Dar Spices" ↔ DSC. */
async function matchCompany(q: string): Promise<{ id: number; name: string } | null> {
  const { data } = await sb.from("companies").select("id,name,legal_name,aliases,file_prefix,code_prefix").eq("active", true);
  const lower = ` ${q.toLowerCase()} `;
  let best: { id: number; name: string; len: number } | null = null;
  for (const c of (data ?? []) as Record<string, unknown>[]) {
    const cands = [c.name, c.legal_name, c.file_prefix, c.code_prefix, ...(Array.isArray(c.aliases) ? (c.aliases as unknown[]) : [])];
    for (const cand of cands) {
      const s = String(cand ?? "").toLowerCase().trim();
      if (s.length < 3) continue; // skip 2-char codes that match inside words
      const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(lower) && (!best || s.length > best.len)) {
        best = { id: c.id as number, name: c.name as string, len: s.length };
      }
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}

/** WHO IS ON LEAVE — approved leave overlapping today (or the coming week). */
async function leaveAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\bon leave\b|who'?s? (off|out|away)|(is|are) (anyone )?(off|out|away|on leave)|absent|who is off/i.test(q)) return null;
  const thisWeek = /week|coming|upcoming|soon/i.test(q);
  const today = startOfToday();
  const horizon = new Date(today.getTime() + (thisWeek ? 7 : 0) * day);
  const { data } = await sb
    .from("leave_requests")
    .select("start_date,end_date,status,people(name),leave_types(name)")
    .eq("status", "Approved")
    .lte("start_date", iso(horizon) + "T23:59:59")
    .gte("end_date", iso(today))
    .order("start_date", { ascending: true })
    .limit(20);
  const rows: SmartRow[] = (data ?? []).map((r: Record<string, unknown>) => {
    const p = r.people as { name?: string } | { name?: string }[] | null;
    const lt = r.leave_types as { name?: string } | { name?: string }[] | null;
    const name = (Array.isArray(p) ? p[0]?.name : p?.name) ?? "Someone";
    const type = (Array.isArray(lt) ? lt[0]?.name : lt?.name) ?? "Leave";
    const s = r.start_date ? new Date(r.start_date as string) : null;
    const e = r.end_date ? new Date(r.end_date as string) : null;
    const onNow = !!s && !!e && s.getTime() <= today.getTime() && e.getTime() >= today.getTime();
    return {
      label: name,
      sub: `${type} · ${s ? iso(s) : "?"} → ${e ? iso(e) : "?"}`,
      badge: onNow ? "off now" : "upcoming",
      tone: onNow ? "warn" : "muted",
      href: "/hrms/leave",
    };
  });
  if (rows.length === 0) return { kind: "leave", title: thisWeek ? "On leave this week" : "On leave today", count: 0, rows: [], note: "Nobody — everyone's in.", href: "/hrms/leave" };
  return { kind: "leave", title: thisWeek ? "On leave this week" : "On leave today", count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/hrms/leave" };
}

/** EXPIRED / EXPIRING documents — optionally of a named type, optionally a window. */
async function docExpiryAnswer(q: string): Promise<SmartAnswer | null> {
  const wantExpired = /\bexpired\b|out of date|lapsed/i.test(q);
  // "expired" also matches the base "expir…" — so only treat it as an EXPIRING
  // query when it's not already an EXPIRED one.
  const wantExpiring = !wantExpired && /\bexpiring\b|\bexpiry\b|expires\b|renew|due (soon|this|for renewal)|valid until|coming due/i.test(q);
  if (!wantExpired && !wantExpiring) return null;
  // A document type named in the query narrows it (e.g. "expired permits").
  const type = bestDocType(q.replace(/\b(expired|expiring|expiry|expires|renew|renewal|due|soon|this|week|month|documents?|which|what|show|list|are)\b/gi, " ").trim());
  const window = /month/i.test(q) ? 30 : /week/i.test(q) ? 7 : 90;
  const today = startOfToday();

  const { data } = await sb
    .from("documents")
    .select("id,title,file_name,doc_type,company_id,person_id,expiry_date")
    .eq("archived", false).eq("intake_state", "filed").not("expiry_date", "is", null)
    .order("expiry_date", { ascending: true }).limit(400);
  let docs = (data ?? []) as Record<string, unknown>[];
  if (type) docs = docs.filter((d) => deriveFiling(d.file_name as string | null, d.title as string, "").typeKey === type.key);

  const rows: SmartRow[] = [];
  for (const d of docs) {
    const exp = new Date(d.expiry_date as string);
    const days = Math.floor((exp.getTime() - today.getTime()) / day);
    const isExpired = days < 0;
    const isExpiring = days >= 0 && days <= window;
    if (wantExpired && !wantExpiring && !isExpired) continue;
    if (wantExpiring && !wantExpired && !isExpiring) continue;
    if (wantExpired && wantExpiring && !isExpired && !isExpiring) continue;
    rows.push({
      label: d.title as string,
      sub: (d.doc_type as string | null) ?? null,
      badge: isExpired ? `expired ${-days}d ago` : `in ${days}d`,
      tone: isExpired ? "danger" : days <= 14 ? "warn" : "muted",
      href: d.person_id ? `/documents?person=${d.person_id}` : d.company_id ? `/documents?company=${d.company_id}` : "/documents",
    });
  }
  if (rows.length === 0) return null;
  const title = wantExpired && !wantExpiring
    ? (type ? `Expired ${type.label.toLowerCase()}s` : "Expired documents")
    : `Documents expiring${/month/i.test(q) ? " this month" : /week/i.test(q) ? " this week" : " soon"}`;
  return { kind: wantExpired && !wantExpiring ? "expired" : "expiry", title, count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/documents" };
}

/** OVERDUE tasks — past deadline, still open. Optionally scoped to a company. */
async function overdueTasksAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/overdue|past due|late task|behind|missed deadline/i.test(q)) return null;
  const company = await matchCompany(q);
  const rows = (await dueTaskRows(company?.id ?? null, new Date(startOfToday().getTime() - 1).toISOString()))
    .filter((r) => r.tone === "danger"); // strictly past-deadline
  const title = company ? `${company.name} · overdue tasks` : "Overdue tasks";
  if (rows.length === 0) return { kind: "tasks", title, count: 0, rows: [], note: "Nothing overdue — all on track.", href: "/?tab=tasks&flag=overdue" };
  return { kind: "tasks", title, count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/?tab=tasks&flag=overdue" };
}

/** Task rows due by a horizon (overdue + upcoming), open only. */
async function dueTaskRows(companyId: number | null, endIso: string): Promise<SmartRow[]> {
  let qb = sb.from("tasks")
    .select("code,action_item,deadline,status,company_id,companies(name)")
    .eq("archived", false)
    .not("deadline", "is", null)
    .lte("deadline", endIso)
    .not("status", "in", '("Completed","Closed")')
    .order("deadline", { ascending: true }).limit(40);
  if (companyId) qb = qb.eq("company_id", companyId);
  const { data } = await qb;
  const today = startOfToday();
  return (data ?? []).map((t: Record<string, unknown>) => {
    const c = t.companies as { name?: string } | { name?: string }[] | null;
    const cn = (Array.isArray(c) ? c[0]?.name : c?.name) ?? null;
    const dl = t.deadline ? new Date(t.deadline as string) : null;
    const days = dl ? Math.floor((dl.getTime() - today.getTime()) / day) : null;
    const badge = days == null ? null : days < 0 ? `${-days}d late` : days === 0 ? "today" : `in ${days}d`;
    return { label: `[${t.code}] ${t.action_item}`, sub: cn, badge, tone: (days != null && days < 0 ? "danger" : days === 0 ? "warn" : "muted") as SmartTone, href: `/task/${t.code}` };
  });
}

/** DEADLINES / what's DUE today or this week (includes overdue). */
async function dueTasksAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/deadline|due (today|this week|soon|now|by)|what'?s due|(what|which) .*\bdue\b|due date/i.test(q)) return null;
  const thisWeek = /week/i.test(q);
  const today = startOfToday();
  const end = new Date(today.getTime() + (thisWeek ? 7 * day : day - 1));
  const company = await matchCompany(q);
  const rows = await dueTaskRows(company?.id ?? null, end.toISOString());
  const scope = company ? `${company.name} · ` : "";
  const title = `${scope}Due ${thisWeek ? "this week" : "today"}`;
  if (rows.length === 0) return { kind: "tasks", title, count: 0, rows: [], note: thisWeek ? "Nothing due this week." : "Nothing due today.", href: "/?tab=tasks" };
  return { kind: "tasks", title, count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/?tab=tasks" };
}

/** HOW MANY … — instant counts for the common entities. */
async function countAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/how many|number of|count of|total (number )?of|how much/i.test(q)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const head = async (table: string, apply: (qb: any) => any): Promise<number> => {
    try {
      const { count } = await apply(sb.from(table).select("id", { count: "exact", head: true }));
      return count ?? 0;
    } catch { return 0; }
  };
  if (/compan/i.test(q)) { const n = await head("companies", (qb) => qb.eq("active", true)); return { kind: "count", title: "Active companies", count: n, rows: [], href: "/companies" }; }
  if (/staff|people|employee|team/i.test(q)) { const n = await head("people", (qb) => qb.eq("active", true)); return { kind: "count", title: "Active staff", count: n, rows: [], href: "/people" }; }
  if (/document|file|paper/i.test(q)) { const n = await head("documents", (qb) => qb.eq("archived", false).eq("intake_state", "filed")); return { kind: "count", title: "Filed documents", count: n, rows: [], href: "/documents" }; }
  if (/task/i.test(q)) {
    const open = await head("tasks", (qb) => qb.eq("archived", false).not("status", "in", '("Completed","Closed")'));
    return { kind: "count", title: "Open tasks", count: open, rows: [], href: "/?tab=tasks" };
  }
  if (/vendor|supplier/i.test(q)) { const n = await head("vendors", (qb) => qb.eq("active", true)); return { kind: "count", title: "Active vendors", count: n, rows: [], href: "/hrms/assets" }; }
  return null;
}

/** WHO IS MISSING a document — people whose compliance checklist still lacks the
 *  named document (e.g. "who is missing a passport", "staff without a contract"). */
async function missingDocAnswer(q: string): Promise<SmartAnswer | null> {
  // PERSON-oriented only ("who is missing a passport", "staff without a
  // contract") — a bare "X missing documents" with a company is handled by
  // companyComplianceAnswer (which runs first).
  if (!/\b(who|which|anyone|everyone|list|staff|people|employees?|any)\b.*\b(missing|without|lacks?|hasn'?t|doesn'?t have|needs?|no|not have)\b/i.test(q)
    && !/\b(missing|without)\b\s+(a |an |their )?(passport|visa|permit|contract|nida|id|licen[cs]e|photo|cv|certificate|tin)/i.test(q)) return null;
  // The document concept (passport / visa / contract / NIDA …) from the query.
  const cleaned = q.replace(/\b(who|which|anyone|everyone|list|is|are|has|have|missing|without|lacks?|hasn'?t|doesn'?t|need|needs|a|an|their|the|staff|people|employees?|no|not|got|any)\b/gi, " ").replace(/[^a-z0-9 ]/gi, " ").trim();
  const type = bestDocType(cleaned);
  const concept = type ? type.label.split(/\s+/).find((w) => w.length >= 4)?.toLowerCase() : cleaned.split(/\s+/).find((w) => w.length >= 4)?.toLowerCase();
  if (!concept) return null;
  // Prefer the EXACT checklist label the catalogue type satisfies ("Passport",
  // not "Passport photo"); fall back to a keyword match when no type resolved.
  const targetLabel = type?.personReqLabel ?? null;
  const base = sb.from("person_requirements").select("label,status,people(name,active)").in("status", ["missing", "requested"]).limit(200);
  const { data } = await (targetLabel ? base.eq("label", targetLabel) : base.ilike("label", `%${concept}%`));
  const seen = new Set<string>();
  const rows: SmartRow[] = [];
  let label = targetLabel ?? concept;
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const p = r.people as { name?: string; active?: boolean } | { name?: string; active?: boolean }[] | null;
    const person = Array.isArray(p) ? p[0] : p;
    if (!person?.name || person.active === false || seen.has(person.name)) continue;
    seen.add(person.name);
    label = (r.label as string) || label;
    rows.push({ label: person.name, sub: `missing ${(r.label as string) ?? label}`, badge: "missing", tone: "warn", href: "/people" });
  }
  const title = `Missing: ${label}`;
  if (rows.length === 0) return { kind: "compliance", title, count: 0, rows: [], note: "Everyone on the checklist has it.", href: "/documents" };
  return { kind: "compliance", title, count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/documents" };
}

/** [COMPANY] missing documents / compliance — the company's outstanding
 *  statutory items + its score, read-only (no auto-link writes). */
async function companyComplianceAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/(missing (document|doc|paper|item)|complian|\bgaps?\b|outstanding|what.*(need|require)|up to date|shortfall|statutory)/i.test(q)) return null;
  const company = await matchCompany(q);
  if (!company) return null;
  const { buildCompanyRequirementScores } = await import("@/lib/company-requirements");
  const [score] = await buildCompanyRequirementScores([company]);
  if (!score) return null;
  const rows: SmartRow[] = (score.gaps ?? []).map((g) => ({
    label: g.label, sub: null,
    badge: score.expired > 0 ? "gap" : "missing", tone: "warn",
    href: `/documents?company=${company.id}`,
  }));
  const title = `${company.name} · ${score.score}% compliant`;
  const note = rows.length ? `${rows.length} of ${score.required} still needed` : "All required documents are on file.";
  return { kind: "compliance", title, count: rows.length, rows: rows.slice(0, MAX_ROWS), note, href: `/documents?company=${company.id}` };
}

/** PROBATION ending — staff whose probation end date falls within the window. */
async function probationAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/probation/i.test(q)) return null;
  const window = /month/i.test(q) ? 31 : /week/i.test(q) ? 7 : 60;
  const today = startOfToday();
  const end = new Date(today.getTime() + window * day);
  const { data } = await sb.from("people")
    .select("id,name,probation_end_date").eq("active", true)
    .not("probation_end_date", "is", null)
    .gte("probation_end_date", iso(today)).lte("probation_end_date", iso(end))
    .order("probation_end_date", { ascending: true }).limit(30);
  const rows: SmartRow[] = (data ?? []).map((p: Record<string, unknown>) => {
    const d = new Date(p.probation_end_date as string);
    const days = Math.floor((d.getTime() - today.getTime()) / day);
    return { label: p.name as string, sub: `probation ends ${iso(d)}`, badge: days === 0 ? "today" : `in ${days}d`, tone: days <= 7 ? "warn" : "muted", href: `/people?person=${p.id}` };
  });
  const title = "Probation ending soon";
  if (rows.length === 0) return { kind: "count", title, count: 0, rows: [], note: "Nobody's probation ends in this window.", href: "/people" };
  return { kind: "count", title, count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/people" };
}

/** ASSETS assigned to a person — "what does X have", "assets assigned to X". */
async function assetsAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(assets?|equipment|laptops?|devices?|phones?|vehicles?|kit|hardware)\b/i.test(q) || !/(assigned|for|of|with|have|has|holding|using|issued|got)/i.test(q)) return null;
  const person = await matchPerson(q);
  if (!person) return null;
  const { data } = await sb.from("assets")
    .select("name,status,category")
    .eq("assigned_to_person_id", person.id).eq("archived", false).limit(30);
  const rows: SmartRow[] = (data ?? []).map((a: Record<string, unknown>) => ({
    label: a.name as string, sub: (a.category as string | null) ?? null,
    badge: (a.status as string | null) ?? null, tone: "muted", href: "/hrms/assets",
  }));
  const title = `${person.name} · assets`;
  if (rows.length === 0) return { kind: "count", title, count: 0, rows: [], note: "No assets assigned to them.", href: "/hrms/assets" };
  return { kind: "count", title, count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/hrms/assets" };
}

/** Tasks a specific PERSON raised (created) or is on (owner/assignee). Answers
 *  "how many tasks did Pulin make", "what did Dipto create", "Hiral's tasks",
 *  "tasks assigned to X" — deterministically, from created_by_person_id + the
 *  owner/assignee joins (no AI). Fixes the gap where the LLM had no creator data. */
async function tasksByPersonAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\btasks?\b/i.test(q)) return null;
  // Strip possessive apostrophes ("Hiral's" → "Hiral ") so the name word matches.
  const person = await matchPerson(q.replace(/['’]/g, " "));
  if (!person) return null;
  const given = person.name.split(/\s+/).find((w) => w.length >= 3) ?? person.name;

  const rowsOf = (data: Record<string, unknown>[] | null): SmartRow[] =>
    (data ?? []).map((t) => {
      const c = t.companies as { name?: string } | { name?: string }[] | null;
      const cn = (Array.isArray(c) ? c[0]?.name : c?.name) ?? null;
      const st = (t.status as string) ?? "";
      const done = st === "Completed" || st === "Closed";
      return {
        label: `[${t.code}] ${t.action_item}`,
        sub: cn,
        badge: st || null,
        tone: (done ? "success" : st === "Blocked" || st === "Escalated" ? "danger" : "muted") as SmartTone,
        href: `/task/${t.code}`,
      };
    });

  const createdMode = /\b(made|make|making|creat|raise[sd]?|raising|logg|opened|set\s?up)\b/i.test(q);
  const explicitlyAssigned = /\b(assigned to|working on|responsible for|handling|doing)\b/i.test(q);

  // "made / created / raised by X" → tasks X RAISED (created_by_person_id).
  if (createdMode && !explicitlyAssigned) {
    const { data } = await sb.from("tasks")
      .select("code,action_item,status,company_id,companies(name)")
      .eq("archived", false).eq("created_by_person_id", person.id)
      .order("created_date", { ascending: false }).limit(40);
    const rows = rowsOf(data);
    return {
      kind: "tasks",
      title: `Tasks ${person.name} raised`,
      count: rows.length,
      rows: rows.slice(0, MAX_ROWS),
      note: rows.length === 0 ? `${given} hasn't raised any tasks in the system.` : undefined,
      href: "/?tab=tasks",
    };
  }

  // Otherwise → tasks X is ON (owner or assignee).
  const [{ data: owned }, { data: links }] = await Promise.all([
    sb.from("tasks").select("id").eq("archived", false).eq("owner_id", person.id),
    sb.from("task_assignees").select("task_id").eq("person_id", person.id),
  ]);
  const ids = Array.from(new Set([
    ...((owned ?? []) as Record<string, unknown>[]).map((r) => r.id as number),
    ...((links ?? []) as Record<string, unknown>[]).map((r) => r.task_id as number),
  ]));
  if (ids.length === 0) {
    return { kind: "tasks", title: `${person.name}'s tasks`, count: 0, rows: [], note: `Nothing is assigned to ${given} right now.`, href: "/?tab=tasks" };
  }
  const { data } = await sb.from("tasks")
    .select("code,action_item,status,company_id,companies(name)")
    .eq("archived", false).in("id", ids).limit(40);
  const rows = rowsOf(data);
  return { kind: "tasks", title: `${person.name}'s tasks`, count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/?tab=tasks" };
}

/** Leaderboard — "who created/made the most tasks", "top task creators", "who's
 *  the busiest". Ranks people by tasks they RAISED (created_by_person_id) or,
 *  when asked about "assigned/busiest", tasks they're ON. */
async function mostTasksByPersonAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(most|top|busiest|biggest|leaderboard|rank)\b/i.test(q) || !/\btasks?\b/i.test(q)) return null;
  const involvedMode = /\b(assigned|working|busiest|involved|handling|has|on)\b/i.test(q) && !/\b(creat|made|make|raise)\b/i.test(q);

  const counts = new Map<number, number>();
  if (involvedMode) {
    const [{ data: owned }, { data: links }] = await Promise.all([
      sb.from("tasks").select("owner_id").eq("archived", false).not("owner_id", "is", null),
      sb.from("task_assignees").select("person_id"),
    ]);
    for (const r of (owned ?? []) as Record<string, unknown>[]) counts.set(r.owner_id as number, (counts.get(r.owner_id as number) ?? 0) + 1);
    for (const r of (links ?? []) as Record<string, unknown>[]) counts.set(r.person_id as number, (counts.get(r.person_id as number) ?? 0) + 1);
  } else {
    const { data } = await sb.from("tasks").select("created_by_person_id").eq("archived", false).not("created_by_person_id", "is", null);
    for (const r of (data ?? []) as Record<string, unknown>[]) counts.set(r.created_by_person_id as number, (counts.get(r.created_by_person_id as number) ?? 0) + 1);
  }
  if (counts.size === 0) return { kind: "count", title: involvedMode ? "Busiest people" : "Top task creators", count: 0, rows: [], note: "No task attribution recorded yet.", href: "/?tab=tasks" };

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ROWS);
  const { data: peopleRows } = await sb.from("people").select("id,name").in("id", top.map(([id]) => id));
  const nameById = new Map((peopleRows ?? []).map((p) => [p.id as number, p.name as string]));
  const rows: SmartRow[] = top.map(([id, n], i) => ({
    label: nameById.get(id) ?? `Person #${id}`,
    sub: null,
    badge: `${n} task${n === 1 ? "" : "s"}`,
    tone: (i === 0 ? "accent" : "muted") as SmartTone,
    href: "/people",
  }));
  return { kind: "count", title: involvedMode ? "Busiest people (most tasks)" : "Top task creators", count: rows.length, rows, href: "/?tab=tasks" };
}

/** WORKLOAD — "workload", "who's overloaded", "who has too many / the most
 *  tasks", "task distribution / balance", "is anyone overloaded". Shows how OPEN
 *  tasks spread across active people (owner + assignees), heaviest-first, and
 *  flags anyone well above the team average. Reuses the memoised getAllTasks()
 *  read + the pure computeWorkload() — same distribution as the Insights panel,
 *  deterministic, no AI. */
async function workloadAnswer(q: string): Promise<SmartAnswer | null> {
  const overloadPhrasing = /\boverload(ed|ing)?\b|too many tasks|task (distribution|balance|spread|load)|workload|spread of tasks|who('?s| is) (the )?(most )?(busy|busiest|stretched|swamped|overwhelmed)/i.test(q);
  const mostTasks = /\b(who|which person)\b/i.test(q) && /\bmost tasks\b/i.test(q);
  if (!overloadPhrasing && !mostTasks) return null;

  const [rows, { data: people }] = await Promise.all([
    getAllTasks(),
    sb.from("people").select("id,name,company_id").eq("active", true),
  ]);
  const summary = computeWorkload(
    rows,
    (people ?? []).map((p) => ({ id: p.id as number, name: p.name as string, companyId: (p.company_id as number | null) ?? null })),
  );
  if (summary.totalOpen === 0) {
    return { kind: "count", title: "Workload", count: 0, rows: [], note: "No open tasks assigned to anyone — everyone's clear.", href: "/insights" };
  }

  const avg = summary.average % 1 === 0 ? String(summary.average) : summary.average.toFixed(1);
  const loaded = summary.people.filter((p) => p.open > 0);
  const rowsOut: SmartRow[] = loaded.slice(0, MAX_ROWS).map((p) => {
    const parts = [`${p.open} open`];
    if (p.overdue > 0) parts.push(`${p.overdue} overdue`);
    return {
      label: p.name,
      sub: p.overloaded ? `well above the ${avg} average` : null,
      badge: parts.join(" · "),
      tone: (p.overloaded ? "warn" : p.overdue > 0 ? "danger" : "muted") as SmartTone,
      href: "/insights",
    };
  });
  const note = summary.overloaded.length > 0
    ? `${summary.overloaded.map((p) => `${p.name} ${p.open}`).join(", ")} · well above the ${avg} average.`
    : `Evenly spread — team average is ${avg} open each.`;
  return { kind: "count", title: "Workload — open tasks per person", count: loaded.length, rows: rowsOut, note, href: "/insights" };
}

/** Leaderboard — "who has the most overdue", "who's most behind", "who's
 *  overloaded with late tasks". Ranks people (owner + assignees) by the number
 *  of OPEN, past-deadline tasks they're on. Deterministic/offline. */
async function mostOverdueByPersonAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(who|which person|whose)\b/i.test(q)) return null;
  if (!/\b(most|worst|top|biggest|behind|overloaded)\b/i.test(q) && !/\bhas the most\b/i.test(q)) return null;
  if (!/overdue|past due|late|behind|slipping|missed/i.test(q)) return null;

  const nowIso = new Date().toISOString();
  const { data: overdue } = await sb.from("tasks")
    .select("id,owner_id")
    .eq("archived", false)
    .not("deadline", "is", null).lt("deadline", nowIso)
    .not("status", "in", '("Completed","Closed")');
  const overdueRows = (overdue ?? []) as Record<string, unknown>[];
  if (overdueRows.length === 0) return { kind: "count", title: "Most overdue by person", count: 0, rows: [], note: "Nothing overdue — everyone's on track.", href: "/?tab=tasks&flag=overdue" };

  const ids = overdueRows.map((r) => r.id as number);
  const { data: links } = await sb.from("task_assignees").select("task_id,person_id").in("task_id", ids);
  const counts = new Map<number, number>();
  for (const r of overdueRows) if (r.owner_id != null) counts.set(r.owner_id as number, (counts.get(r.owner_id as number) ?? 0) + 1);
  // Assignees who aren't already the owner also carry the overdue task.
  const ownerByTask = new Map(overdueRows.map((r) => [r.id as number, r.owner_id as number | null]));
  for (const r of (links ?? []) as Record<string, unknown>[]) {
    const pid = r.person_id as number;
    if (ownerByTask.get(r.task_id as number) === pid) continue; // don't double-count
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  if (counts.size === 0) return { kind: "count", title: "Most overdue by person", count: 0, rows: [], note: "Overdue tasks aren't assigned to anyone yet.", href: "/?tab=tasks&flag=overdue" };

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ROWS);
  const { data: peopleRows } = await sb.from("people").select("id,name").in("id", top.map(([id]) => id));
  const nameById = new Map((peopleRows ?? []).map((p) => [p.id as number, p.name as string]));
  const rows: SmartRow[] = top.map(([id, n], i) => ({
    label: nameById.get(id) ?? `Person #${id}`,
    sub: null,
    badge: `${n} overdue`,
    tone: (i === 0 ? "danger" : "warn") as SmartTone,
    href: "/?tab=tasks&flag=overdue",
  }));
  return { kind: "count", title: "Most overdue by person", count: rows.length, rows, href: "/?tab=tasks&flag=overdue" };
}

/** WHAT CHANGED — "tasks updated today", "recently changed/updated", "what's
 *  changed this week". Lists open+recently-touched tasks by last_updated_at. */
async function recentlyUpdatedTasksAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(updated|changed|touched|edited|modified|recent(ly)?|latest)\b/i.test(q) || !/\btasks?\b/i.test(q)) return null;
  const todayOnly = /\btoday\b/i.test(q);
  const thisWeek = /\bweek\b/i.test(q);
  const since = todayOnly ? startOfToday() : new Date(startOfToday().getTime() - (thisWeek ? 7 : 3) * day);
  const company = await matchCompany(q);

  let qb = sb.from("tasks")
    .select("code,action_item,status,last_updated_at,company_id,companies(name)")
    .eq("archived", false)
    .not("last_updated_at", "is", null)
    .gte("last_updated_at", since.toISOString())
    .order("last_updated_at", { ascending: false }).limit(40);
  if (company) qb = qb.eq("company_id", company.id);
  const { data } = await qb;
  const now = Date.now();
  const rows: SmartRow[] = (data ?? []).map((t: Record<string, unknown>) => {
    const c = t.companies as { name?: string } | { name?: string }[] | null;
    const cn = (Array.isArray(c) ? c[0]?.name : c?.name) ?? null;
    const upd = t.last_updated_at ? new Date(t.last_updated_at as string) : null;
    const hrs = upd ? Math.floor((now - upd.getTime()) / 3_600_000) : null;
    const badge = hrs == null ? null : hrs < 1 ? "just now" : hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
    return { label: `[${t.code}] ${t.action_item}`, sub: cn, badge, tone: "muted" as SmartTone, href: `/task/${t.code}` };
  });
  const scope = company ? `${company.name} · ` : "";
  const win = todayOnly ? "today" : thisWeek ? "this week" : "recently";
  const title = `${scope}Tasks updated ${win}`;
  if (rows.length === 0) return { kind: "tasks", title, count: 0, rows: [], note: `No task updates ${win}.`, href: "/?tab=tasks" };
  return { kind: "tasks", title, count: rows.length, rows: rows.slice(0, MAX_ROWS), href: "/?tab=tasks" };
}

/** Compare TWO (or more) companies mentioned in the query — "compare Dar Spices
 *  and Terra Green", "Dar vs Terra". Shows each side's open + overdue task load. */
async function compareAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(compare|comparison|versus|vs|difference between)\b/i.test(q)) return null;
  const { data: cos } = await sb.from("companies").select("id,name,legal_name,aliases,code_prefix,file_prefix").eq("active", true);
  const lower = ` ${q} `;
  const mentioned: { id: number; name: string }[] = [];
  const seen = new Set<number>();
  for (const c of (cos ?? []) as Record<string, unknown>[]) {
    const cands = [c.name, c.legal_name, c.code_prefix, c.file_prefix, ...(Array.isArray(c.aliases) ? (c.aliases as unknown[]) : [])];
    for (const cand of cands) {
      const s = String(cand ?? "").toLowerCase().trim();
      if (s.length < 3) continue;
      if (new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower) && !seen.has(c.id as number)) {
        seen.add(c.id as number);
        mentioned.push({ id: c.id as number, name: c.name as string });
      }
    }
  }
  if (mentioned.length < 2) return null; // need at least two things to compare

  const rows: SmartRow[] = [];
  for (const co of mentioned.slice(0, 4)) {
    const nowIso = new Date().toISOString();
    const [{ count: open }, { count: overdue }] = await Promise.all([
      sb.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", co.id).eq("archived", false).not("status", "in", '("Completed","Closed")'),
      sb.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", co.id).eq("archived", false).not("status", "in", '("Completed","Closed")').not("deadline", "is", null).lt("deadline", nowIso),
    ]);
    rows.push({
      label: co.name,
      sub: `${open ?? 0} open · ${overdue ?? 0} overdue`,
      badge: `${overdue ?? 0} overdue`,
      tone: ((overdue ?? 0) > 0 ? "danger" : "success") as SmartTone,
      href: `/companies/${co.id}`,
    });
  }
  return { kind: "count", title: `Comparing ${mentioned.slice(0, 4).map((m) => m.name).join(" · ")}`, count: rows.length, rows, href: "/companies" };
}

/** PERFORMANCE — "how efficient is X", "X's response rate", "how many tasks did X
 *  complete", "average time X takes to finish a task". Deterministic (analytics.ts). */
async function performanceAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(efficien|response rate|responsive|how many .*(complete|finish|done)|average|avg|on[- ]time|how (fast|long|quick)|productiv|performance|completion)/i.test(q)) return null;
  const person = await matchPerson(q.replace(/['’]/g, " "));
  if (!person) return null;
  const { completionStats, responseStats } = await import("@/lib/analytics");
  const [c, r] = await Promise.all([completionStats(person.id), responseStats(person.id)]);
  const rows: SmartRow[] = [
    { label: "Tasks completed", sub: null, badge: String(c.completed), tone: "accent", href: "/?tab=tasks" },
    { label: "On-time", sub: c.onTimePct == null ? "no deadlines set" : `${c.onTime} of those with a deadline`, badge: c.onTimePct == null ? "—" : `${c.onTimePct}%`, tone: (c.onTimePct != null && c.onTimePct >= 70 ? "success" : "warn") as SmartTone, href: "/?tab=tasks" },
    { label: "Avg time to complete", sub: null, badge: c.avgDays == null ? "—" : `${c.avgDays}d`, tone: "muted", href: "/?tab=tasks" },
    { label: "Response rate", sub: `posts updates on ${r.responded} of ${r.assigned} tasks`, badge: r.responseRatePct == null ? "—" : `${r.responseRatePct}%`, tone: (r.responseRatePct != null && r.responseRatePct >= 60 ? "success" : "warn") as SmartTone, href: "/?tab=tasks" },
    { label: "Avg time to first update", sub: null, badge: r.avgFirstResponseDays == null ? "—" : `${r.avgFirstResponseDays}d`, tone: "muted", href: "/?tab=tasks" },
  ];
  return { kind: "count", title: `${person.name} · performance`, count: rows.length, rows };
}

/** ENGAGEMENT — "how often does X open the app", "when was X last seen/active".
 *  Honours a time qualifier in the question ("...today", "...this week") — the
 *  opens count + phrasing scope to that window; the 30-day view is the default. */
async function engagementAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(open|opens|opened|log ?in|logs? in|active|last seen|engage|use the (app|site)|how often)\b/i.test(q)) return null;
  const person = await matchPerson(q.replace(/['’]/g, " "));
  if (!person) return null;
  const { appOpenStats } = await import("@/lib/activity-telemetry");
  // Scope the window to a qualifier in the literal question, else 30 days.
  const todayOnly = /\btoday\b/i.test(q);
  const thisWeek = !todayOnly && /\b(this week|past week|last 7 days|week)\b/i.test(q);
  const windowDays = todayOnly ? 1 : thisWeek ? 7 : 30;
  const s = await appOpenStats(person.id, windowDays);
  const last = s.lastSeen ? new Date(s.lastSeen) : null;
  const lastLabel = last ? `${Math.max(0, Math.floor((Date.now() - last.getTime()) / 86400000))}d ago` : "never";
  // Window-specific labels so we answer the literal question, not a fixed 30d.
  const winLabel = todayOnly ? "today" : thisWeek ? "this week" : "last 30 days";
  const opensLabel = todayOnly ? "Opens today" : thisWeek ? "Opens this week" : "Opens (last 30 days)";
  const rows: SmartRow[] = [
    { label: opensLabel, sub: null, badge: String(s.opens), tone: "accent", href: "#" },
  ];
  // "Active days" only makes sense for a multi-day window.
  if (!todayOnly) {
    rows.push({ label: `Active days (of ${windowDays})`, sub: null, badge: String(s.days), tone: (s.days >= (thisWeek ? 3 : 10) ? "success" : "warn") as SmartTone, href: "#" });
  }
  rows.push({ label: "Last seen", sub: null, badge: lastLabel, tone: "muted", href: "#" });
  const note = s.opens === 0
    ? (todayOnly ? "No app activity today." : thisWeek ? "No app activity this week." : "No app activity recorded yet (telemetry started recently).")
    : undefined;
  return { kind: "count", title: `${person.name} · engagement (${winLabel})`, count: rows.length, rows, note };
}

/* ---- Portal analytics (owner/admin scope) ------------------------------- *
 * These read activity_events (app-open telemetry) + announcement receipts to
 * answer "who's active / least active / most-used pages / who hasn't acked".
 * Deterministic, no AI. All best-effort: a failed query yields null/[].        */

/** Parse the analytics window from the query (default 30 days). */
function analyticsWindow(q: string): { days: number; label: string } {
  if (/\btoday\b/i.test(q)) return { days: 1, label: "today" };
  if (/\b(this week|past week|last 7 days|week)\b/i.test(q)) return { days: 7, label: "this week" };
  if (/\b(90|quarter|three months|3 months)\b/i.test(q)) return { days: 90, label: "last 90 days" };
  return { days: 30, label: "last 30 days" };
}

/** Bulk per-person open stats across the whole estate over `windowDays`. One
 *  query over activity_events, aggregated in memory. Returns a map by personId. */
async function estateOpenStats(windowDays: number): Promise<Map<number, { opens: number; days: number; lastSeen: string | null }>> {
  const since = new Date(Date.now() - windowDays * day).toISOString();
  const out = new Map<number, { opens: number; days: number; daySet: Set<string>; lastSeen: string | null }>();
  const { data } = await sb.from("activity_events")
    .select("person_id,at").not("person_id", "is", null).gte("at", since)
    .order("at", { ascending: false }).limit(5000);
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const pid = r.person_id as number;
    const at = r.at as string;
    let e = out.get(pid);
    if (!e) { e = { opens: 0, days: 0, daySet: new Set(), lastSeen: at }; out.set(pid, e); }
    e.opens += 1;
    e.daySet.add(at.slice(0, 10));
    if (!e.lastSeen || at > e.lastSeen) e.lastSeen = at;
  }
  const result = new Map<number, { opens: number; days: number; lastSeen: string | null }>();
  for (const [pid, e] of out) result.set(pid, { opens: e.opens, days: e.daySet.size, lastSeen: e.lastSeen });
  return result;
}

/** MOST-USED PAGES — "what pages does X use", "where does X spend time", "most
 *  used pages" (overall or for a named person). Path counts from activity_events. */
async function pageUsageAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(page|pages|screen|screens|section|sections|where.*(spend|go|time)|most used|most visited|most viewed)\b/i.test(q)) return null;
  if (!/\b(use|used|uses|using|visit|visited|spend|spends|go|goes|open|opens|view|views|most)\b/i.test(q)) return null;
  const { days, label } = analyticsWindow(q);
  const since = new Date(Date.now() - days * day).toISOString();
  const person = await matchPerson(q.replace(/['’]/g, " "));

  let qb = sb.from("activity_events").select("path").not("path", "is", null).gte("at", since).limit(8000);
  if (person) qb = qb.eq("person_id", person.id);
  const { data } = await qb;
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const raw = String(r.path ?? "").trim();
    if (!raw) continue;
    // Normalise a path to its section (drop query string + trailing ids).
    const path = raw.split("?")[0].replace(/\/(task|companies|people)\/[^/]+.*$/i, "/$1/…") || "/";
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  if (counts.size === 0) {
    const who = person ? person.name : "the estate";
    return { kind: "count", title: person ? `${person.name} · most-used pages` : "Most-used pages", count: 0, rows: [], note: `No page activity recorded for ${who} ${label}.` };
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ROWS);
  const rows: SmartRow[] = top.map(([path, n], i) => ({
    label: path,
    sub: null,
    badge: `${n} view${n === 1 ? "" : "s"}`,
    tone: (i === 0 ? "accent" : "muted") as SmartTone,
    href: path.includes("…") ? "#" : path,
  }));
  const title = person ? `${person.name} · most-used pages` : "Most-used pages";
  return { kind: "count", title, count: rows.length, rows, note: label };
}

/** WHO HASN'T LOGGED IN / least active — active people with no or low recent
 *  app opens over the window. "who hasn't logged in", "who never opened the app",
 *  "least active", "who's inactive". */
async function inactiveStaffAnswer(q: string): Promise<SmartAnswer | null> {
  const never = /\b(hasn'?t|haven'?t|not|never|no one|nobody)\b.*\b(log ?in|logged in|open|opened|use|used|active|seen)\b/i.test(q)
    || /\b(never|not) (logged in|opened|used|active)\b/i.test(q);
  const least = /\b(least active|inactive|dormant|quiet|low activity|barely|rarely)\b/i.test(q);
  if (!never && !least) return null;
  const { days, label } = analyticsWindow(q);
  const [{ data: people }, stats] = await Promise.all([
    sb.from("people").select("id,name").eq("active", true),
    estateOpenStats(days),
  ]);
  const list = ((people ?? []) as Record<string, unknown>[])
    .map((p) => ({ id: p.id as number, name: p.name as string, opens: stats.get(p.id as number)?.opens ?? 0, lastSeen: stats.get(p.id as number)?.lastSeen ?? null }))
    .sort((a, b) => a.opens - b.opens); // quietest first
  // "never" → strictly zero opens; "least active" → the bottom of the pack.
  const filtered = never ? list.filter((p) => p.opens === 0) : list;
  const rows: SmartRow[] = filtered.slice(0, MAX_ROWS).map((p) => {
    const lastLabel = p.lastSeen ? `last seen ${Math.max(0, Math.floor((Date.now() - new Date(p.lastSeen).getTime()) / day))}d ago` : "never opened the app";
    return {
      label: p.name,
      sub: lastLabel,
      badge: p.opens === 0 ? "0 opens" : `${p.opens} open${p.opens === 1 ? "" : "s"}`,
      tone: (p.opens === 0 ? "warn" : "muted") as SmartTone,
      href: `/people?person=${p.id}`,
    };
  });
  const title = never ? `Not logged in (${label})` : `Least active (${label})`;
  if (rows.length === 0) return { kind: "count", title, count: 0, rows: [], note: `Everyone active has opened the app ${label}.`, href: "/people" };
  return { kind: "count", title, count: never ? filtered.length : rows.length, rows, note: label, href: "/people" };
}

/** ENGAGEMENT LEADERBOARD — "who's most active", "engagement leaderboard",
 *  "portal usage", "top users". Opens ranked by person over the window. */
async function engagementLeaderboardAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(leaderboard|most active|top users?|portal usage|usage|who'?s (the )?most active|busiest (users?|people)|engagement)\b/i.test(q)) return null;
  // Don't hijack task-leaderboard phrasing ("most tasks") — those resolvers run first.
  if (/\btasks?\b/i.test(q)) return null;
  const { days, label } = analyticsWindow(q);
  const [{ data: people }, stats] = await Promise.all([
    sb.from("people").select("id,name").eq("active", true),
    estateOpenStats(days),
  ]);
  const nameById = new Map(((people ?? []) as Record<string, unknown>[]).map((p) => [p.id as number, p.name as string]));
  const ranked = [...stats.entries()]
    .filter(([id]) => nameById.has(id))
    .sort((a, b) => b[1].opens - a[1].opens)
    .slice(0, MAX_ROWS);
  if (ranked.length === 0) return { kind: "count", title: `Engagement leaderboard (${label})`, count: 0, rows: [], note: `No app activity recorded ${label}.`, href: "/people" };
  const rows: SmartRow[] = ranked.map(([id, s], i) => ({
    label: nameById.get(id) ?? `Person #${id}`,
    sub: `${s.days} active day${s.days === 1 ? "" : "s"}`,
    badge: `${s.opens} open${s.opens === 1 ? "" : "s"}`,
    tone: (i === 0 ? "accent" : "muted") as SmartTone,
    href: `/people?person=${id}`,
  }));
  return { kind: "count", title: `Engagement leaderboard (${label})`, count: rows.length, rows, note: label, href: "/people" };
}

/** WHO HASN'T ACKNOWLEDGED an announcement — for a require-ack live announcement,
 *  the audience members with no ack_at. "who hasn't seen/acknowledged the
 *  announcement", "who hasn't read the notice". Reuses the announcements helpers. */
async function announcementAckAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(announcement|notice|memo|bulletin)\b/i.test(q)) return null;
  if (!/\b(hasn'?t|haven'?t|not|who|which)\b.*\b(ack|acknowledg|seen|read|open)\b/i.test(q)
    && !/\b(unacknowledg|unseen|unread)\b/i.test(q)) return null;
  const wantSeen = /\b(seen|read|open)\b/i.test(q) && !/\back|acknowledg/i.test(q);

  const { listAnnouncements, resolveAudiencePersonIds, unseenPersonIds, isLive } = await import("@/lib/announcements");
  const all = await listAnnouncements();
  const live = all.filter((a) => isLive(a));
  if (live.length === 0) return null;
  // Prefer a require-ack announcement (that's what "acknowledge" means); else the
  // most-recent live one. If the query names one by title word, prefer that.
  const words = q.replace(/[^a-z0-9 ]/gi, " ").split(/\s+/).filter((w) => w.length >= 4);
  const byTitle = live.find((a) => words.some((w) => a.title.toLowerCase().includes(w)));
  const target = byTitle ?? live.find((a) => a.requireAck) ?? live[0];
  if (!target) return null;

  const audience = await resolveAudiencePersonIds(target);
  if (audience.length === 0) return null;

  let missingIds: number[];
  if (wantSeen) {
    missingIds = await unseenPersonIds(target);
  } else {
    // Not acknowledged: audience members without an ack_at receipt.
    const { data } = await sb.from("announcement_receipts").select("recipient").eq("announcement_id", target.id).not("ack_at", "is", null);
    const acked = new Set(((data ?? []) as Record<string, unknown>[])
      .map((r) => { const s = String(r.recipient ?? ""); return s.startsWith("person:") ? Number(s.slice(7)) : null; })
      .filter((v): v is number => v != null));
    missingIds = audience.filter((id) => !acked.has(id));
  }

  const verb = wantSeen ? "seen" : "acknowledged";
  const title = `Not ${verb}: ${truncateTitle(target.title)}`;
  if (missingIds.length === 0) return { kind: "count", title, count: 0, rows: [], note: `Everyone in the audience has ${verb} it.`, href: "/announcements" };
  const { data: peopleRows } = await sb.from("people").select("id,name").in("id", missingIds.slice(0, 200));
  const nameById = new Map(((peopleRows ?? []) as Record<string, unknown>[]).map((p) => [p.id as number, p.name as string]));
  const rows: SmartRow[] = missingIds.slice(0, MAX_ROWS).map((id) => ({
    label: nameById.get(id) ?? `Person #${id}`,
    sub: null,
    badge: wantSeen ? "unseen" : "not acked",
    tone: "warn" as SmartTone,
    href: `/people?person=${id}`,
  }));
  return { kind: "count", title, count: missingIds.length, rows, note: `${missingIds.length} of ${audience.length} still outstanding`, href: "/announcements" };
}

function truncateTitle(t: string): string {
  const s = (t ?? "").trim();
  return s.length <= 40 ? s : s.slice(0, 39).trimEnd() + "…";
}

/** RADAR — "what needs my attention", "anything slipping / wrong", "risks",
 *  "what should I worry about". Proactive anomaly scan (ori/radar.ts). */
async function radarAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(needs? (my )?attention|anything (wrong|slipping|off|concerning)|what'?s (wrong|slipping|off|up)|should i worry|radar|red flags?|problems?|falling behind|at risk|worry about|what needs)\b/i.test(q)) return null;
  const { buildRadar } = await import("@/lib/ori/radar");
  const findings = await buildRadar();
  if (findings.length === 0) return { kind: "count", title: "Nothing on the radar", count: 0, rows: [], note: "All clear — nothing overdue, stuck or slipping right now." };
  const rows: SmartRow[] = findings.slice(0, MAX_ROWS).map((f) => ({ label: f.label, sub: f.detail, badge: null, tone: f.tone as SmartTone, href: f.href }));
  return { kind: "count", title: "On the radar", count: findings.length, rows };
}

/** WHAT HAS ORI DONE — recent "ori.action" system_events, newest first. Answers
 *  "what has ORI done", "recent ORI actions", "ORI activity/history/log". */
async function oriActionsAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(ori)\b.*\b(done|do|actions?|activity|history|log|changes?|executed?|run)\b|\b(what|show|recent|latest)\b.*\bori\b/i.test(q)) return null;
  const { data } = await sb
    .from("system_events")
    .select("id,status,details,created_at")
    .eq("kind", "ori.action")
    .order("created_at", { ascending: false })
    .limit(20);
  const list = (data ?? []) as Record<string, unknown>[];
  if (list.length === 0) return { kind: "count", title: "ORI hasn't run any actions yet", count: 0, rows: [], note: "No ORI actions have been executed recently." };
  const rows: SmartRow[] = list.slice(0, MAX_ROWS).map((e) => {
    let d: Record<string, unknown> = {};
    try { d = e.details ? JSON.parse(e.details as string) : {}; } catch { /* free-form */ }
    const tool = String(d.tool ?? "action");
    const summary = String(d.summary ?? d.message ?? "");
    const ok = e.status === "ok";
    const when = new Date(e.created_at as string);
    const ago = when.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return {
      label: tool.replace(/_/g, " "),
      sub: summary || null,
      badge: ago,
      tone: (ok ? "success" : "danger") as SmartTone,
      href: "/insights",
    };
  });
  return { kind: "count", title: "Recent ORI actions", count: list.length, rows };
}

/** Short "N minutes/hours/days ago" from an ISO timestamp. */
function agoLabel(isoTs: string | null): string {
  if (!isoTs) return "";
  const ms = Date.now() - new Date(isoTs).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Same author-resolution as the Live activity feed (owner perspective). */
function authorOf(by: string | null): string {
  if (!by) return "System";
  if (by === "ai-command") return "ORI";
  if (by === "meeting-mode") return "Meeting";
  if (by === "web-ui") return "You";
  if (by.startsWith("portal-dir:")) return by.slice(11);
  if (by.startsWith("portal-mgr:")) return by.slice(11);
  if (by.startsWith("portal-hr:")) return by.slice(10);
  if (by.startsWith("portal:")) return by.slice(7);
  return "Management";
}

/** WHAT HAPPENED TODAY / THIS WEEK / LATELY — an estate-wide "what just went on"
 *  digest across every company (owner scope): task updates posted, new tasks
 *  raised, attendance check-ins, requests raised, announcement acknowledgements.
 *  Newest-first, grouped, with per-stream counts + a couple of examples. */
async function whatHappenedAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(what (happened|went on|has happened|is happening|changed)|what'?s (happening|going on|new|been happening)|any(thing)? new|catch me up|bring me up to speed|activity|what did (everyone|people|the team|we) do|whats new)\b/i.test(q)) return null;
  // Window: today (default), this week, or "lately/recently" (3 days).
  const todayOnly = /\btoday\b/i.test(q);
  const thisWeek = /\b(week|last few days|this week)\b/i.test(q);
  const since = todayOnly ? startOfToday() : new Date(startOfToday().getTime() - (thisWeek ? 7 : 3) * day);
  const sinceIso = since.toISOString();
  const sinceDay = iso(since);

  const [updatesR, newTasksR, checkinsR, requestsR, acksR] = await Promise.all([
    sb.from("task_updates").select("body,created_at,created_by,tasks(code,action_item)").is("deleted_at", null).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(30),
    sb.from("tasks").select("code,action_item,created_date,companies(name)").eq("archived", false).gte("created_date", sinceIso).order("created_date", { ascending: false }).limit(30),
    sb.from("attendance").select("status,updated_at,people(name)").gte("date", sinceDay).order("updated_at", { ascending: false }).limit(60),
    sb.from("requests").select("code,title,created_at,people:requester_id(name)").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(20),
    sb.from("announcement_receipts").select("ack_at,announcements(title)").not("ack_at", "is", null).gte("ack_at", sinceIso).order("ack_at", { ascending: false }).limit(20),
  ]);

  const updates = (updatesR.data ?? []) as Record<string, unknown>[];
  const newTasks = (newTasksR.data ?? []) as Record<string, unknown>[];
  const checkins = (checkinsR.data ?? []) as Record<string, unknown>[];
  const requests = (requestsR.data ?? []) as Record<string, unknown>[];
  const acks = (acksR.data ?? []) as Record<string, unknown>[];
  const firstName = (r: Record<string, unknown>, key: string): string | null => {
    const p = r[key] as { name?: string } | { name?: string }[] | null;
    return (Array.isArray(p) ? p[0]?.name : p?.name) ?? null;
  };

  const rows: SmartRow[] = [];
  // Stream 1 — task updates posted.
  if (updates.length) {
    rows.push({ label: `${updates.length} task update${updates.length === 1 ? "" : "s"} posted`, sub: null, badge: null, tone: "accent", href: "/?tab=timeline" });
    for (const u of updates.slice(0, 2)) {
      const t = u.tasks as { code?: string; action_item?: string } | { code?: string; action_item?: string }[] | null;
      const tt = Array.isArray(t) ? t[0] : t;
      const who = authorOf(u.created_by as string | null);
      const body = ((u.body as string) ?? "").trim().replace(/\s+/g, " ").slice(0, 70);
      rows.push({ label: `${who} on [${tt?.code ?? "?"}]`, sub: body || tt?.action_item || null, badge: agoLabel(u.created_at as string), tone: "muted", href: tt?.code ? `/task/${tt.code}` : "/?tab=timeline" });
    }
  }
  // Stream 2 — new tasks raised.
  if (newTasks.length) {
    rows.push({ label: `${newTasks.length} new task${newTasks.length === 1 ? "" : "s"} raised`, sub: null, badge: null, tone: "accent", href: "/?tab=tasks" });
    for (const t of newTasks.slice(0, 2)) {
      rows.push({ label: `[${t.code}] ${t.action_item}`, sub: firstName(t, "companies"), badge: agoLabel(t.created_date as string), tone: "muted", href: `/task/${t.code}` });
    }
  }
  // Stream 3 — attendance check-ins (Present/Remote/Half-day count as "in").
  if (checkins.length) {
    rows.push({ label: `${checkins.length} attendance check-in${checkins.length === 1 ? "" : "s"}`, sub: null, badge: null, tone: "accent", href: "/hrms/leave" });
    for (const a of checkins.slice(0, 2)) {
      rows.push({ label: firstName(a, "people") ?? "Someone", sub: (a.status as string) ?? null, badge: agoLabel(a.updated_at as string), tone: "muted", href: "/hrms/leave" });
    }
  }
  // Stream 4 — requests raised.
  if (requests.length) {
    rows.push({ label: `${requests.length} request${requests.length === 1 ? "" : "s"} raised`, sub: null, badge: null, tone: "accent", href: "/portal" });
    for (const r of requests.slice(0, 2)) {
      rows.push({ label: `[${r.code}] ${r.title}`, sub: firstName(r, "people"), badge: agoLabel(r.created_at as string), tone: "muted", href: "/portal" });
    }
  }
  // Stream 5 — announcement acknowledgements.
  if (acks.length) {
    rows.push({ label: `${acks.length} announcement ack${acks.length === 1 ? "" : "s"}`, sub: null, badge: null, tone: "accent", href: "/portal/meetings" });
  }

  const win = todayOnly ? "today" : thisWeek ? "this week" : "lately";
  const total = updates.length + newTasks.length + checkins.length + requests.length + acks.length;
  const title = `What happened ${win}`;
  if (total === 0) return { kind: "count", title, count: 0, rows: [], note: `Quiet ${win} — nothing recorded across the estate.`, href: "/?tab=timeline" };
  return { kind: "count", title, count: total, rows: rows.slice(0, MAX_ROWS), note: `${total} event${total === 1 ? "" : "s"} across the portfolio`, href: "/?tab=timeline" };
}

/** WHAT DID <person|company> DO (recently) — that entity's recent activity:
 *  updates they posted, tasks they raised/moved, and (for a person) check-ins.
 *  Deterministic, owner scope. Runs after the estate-wide digest. */
async function entityActivityAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(what (did|has|have)|activity|been (doing|up to)|recent(ly)?)\b/i.test(q)) return null;
  if (!/\b(do|did|doing|done|been|activity|working|up to|post|posted|moved?|raised?|created?|updates?)\b/i.test(q)) return null;
  const since = new Date(startOfToday().getTime() - 14 * day);
  const sinceIso = since.toISOString();

  // Prefer a named PERSON; else a named COMPANY.
  const person = await matchPerson(q.replace(/['’]/g, " "));
  if (person) {
    const [updatesR, tasksR, checkinsR] = await Promise.all([
      sb.from("task_updates").select("body,created_at,created_by,tasks(code)").is("deleted_at", null).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(60),
      sb.from("tasks").select("code,action_item,created_date").eq("archived", false).eq("created_by_person_id", person.id).gte("created_date", sinceIso).order("created_date", { ascending: false }).limit(20),
      sb.from("attendance").select("status,updated_at").eq("person_id", person.id).gte("date", iso(since)).order("updated_at", { ascending: false }).limit(20),
    ]);
    // Updates authored by this person — match the portal stamp "portal*:<Name>".
    const given = person.name.split(/\s+/).find((w) => w.length >= 3) ?? person.name;
    const mine = ((updatesR.data ?? []) as Record<string, unknown>[]).filter((u) => authorOf(u.created_by as string | null).toLowerCase().includes(given.toLowerCase()));
    const tasks = (tasksR.data ?? []) as Record<string, unknown>[];
    const checkins = (checkinsR.data ?? []) as Record<string, unknown>[];
    const rows: SmartRow[] = [];
    for (const u of mine.slice(0, 3)) {
      const t = u.tasks as { code?: string } | { code?: string }[] | null;
      const code = (Array.isArray(t) ? t[0]?.code : t?.code) ?? "?";
      rows.push({ label: `Posted on [${code}]`, sub: ((u.body as string) ?? "").trim().replace(/\s+/g, " ").slice(0, 70) || null, badge: agoLabel(u.created_at as string), tone: "muted", href: code !== "?" ? `/task/${code}` : "/?tab=timeline" });
    }
    for (const t of tasks.slice(0, 3)) {
      rows.push({ label: `Raised [${t.code}]`, sub: (t.action_item as string) ?? null, badge: agoLabel(t.created_date as string), tone: "accent", href: `/task/${t.code}` });
    }
    for (const a of checkins.slice(0, 2)) {
      rows.push({ label: `Checked in · ${(a.status as string) ?? "Present"}`, sub: null, badge: agoLabel(a.updated_at as string), tone: "muted", href: "/hrms/leave" });
    }
    const total = mine.length + tasks.length + checkins.length;
    const title = `${person.name} · recent activity`;
    if (total === 0) return { kind: "count", title, count: 0, rows: [], note: `Nothing from ${given} in the last two weeks.`, href: "/?tab=timeline" };
    return { kind: "count", title, count: total, rows: rows.slice(0, MAX_ROWS), note: `${total} event${total === 1 ? "" : "s"} in the last 2 weeks`, href: "/?tab=timeline" };
  }

  const company = await matchCompany(q);
  if (company) {
    const [updatesR, tasksR] = await Promise.all([
      sb.from("task_updates").select("body,created_at,created_by,tasks!inner(code,company_id)").is("deleted_at", null).gte("created_at", sinceIso).eq("tasks.company_id", company.id).order("created_at", { ascending: false }).limit(20),
      sb.from("tasks").select("code,action_item,created_date").eq("archived", false).eq("company_id", company.id).gte("created_date", sinceIso).order("created_date", { ascending: false }).limit(20),
    ]);
    const updates = (updatesR.data ?? []) as Record<string, unknown>[];
    const tasks = (tasksR.data ?? []) as Record<string, unknown>[];
    const rows: SmartRow[] = [];
    for (const u of updates.slice(0, 4)) {
      const t = u.tasks as { code?: string } | { code?: string }[] | null;
      const code = (Array.isArray(t) ? t[0]?.code : t?.code) ?? "?";
      rows.push({ label: `${authorOf(u.created_by as string | null)} on [${code}]`, sub: ((u.body as string) ?? "").trim().replace(/\s+/g, " ").slice(0, 70) || null, badge: agoLabel(u.created_at as string), tone: "muted", href: code !== "?" ? `/task/${code}` : "/?tab=timeline" });
    }
    for (const t of tasks.slice(0, 3)) {
      rows.push({ label: `New [${t.code}]`, sub: (t.action_item as string) ?? null, badge: agoLabel(t.created_date as string), tone: "accent", href: `/task/${t.code}` });
    }
    const total = updates.length + tasks.length;
    const title = `${company.name} · recent activity`;
    if (total === 0) return { kind: "count", title, count: 0, rows: [], note: `No activity at ${company.name} in the last two weeks.`, href: `/companies/${company.id}` };
    return { kind: "count", title, count: total, rows: rows.slice(0, MAX_ROWS), note: `${total} event${total === 1 ? "" : "s"} in the last 2 weeks`, href: `/companies/${company.id}` };
  }
  return null;
}

/** DAILY BRIEFING — "my briefing / brief me / what should I focus on / daily
 *  briefing / catch me up fully". Composes the SAME radar + recent-activity +
 *  derived next-actions the /api/briefing endpoint serves into one SmartAnswer
 *  card: radar findings first (worst-first), then a couple of suggested actions,
 *  then a line of recent activity. Deterministic, best-effort. */
async function briefingAnswer(q: string): Promise<SmartAnswer | null> {
  if (!/\b(my briefing|daily briefing|brief me|briefing|what should i (focus on|do|prioriti[sz]e|work on)|catch me up fully|full catch[- ]?up|where (are|do) (we|things) (stand|at)|morning briefing|state of play)\b/i.test(q)) return null;

  const { buildRadar } = await import("@/lib/ori/radar");
  const findings = await buildRadar().catch(() => []);

  // Recent activity (last 3 days), lightweight — mirror the briefing endpoint's
  // top few notable events so the card shows "what changed" too.
  const sinceIso = new Date(startOfToday().getTime() - 3 * day).toISOString();
  let recent: Record<string, unknown>[] = [];
  let newT: Record<string, unknown>[] = [];
  try {
    const [updatesR, newTasksR] = await Promise.all([
      sb.from("task_updates").select("body,created_at,created_by,tasks(code)").is("deleted_at", null).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(3),
      sb.from("tasks").select("code,action_item,created_date").eq("archived", false).gte("created_date", sinceIso).order("created_date", { ascending: false }).limit(3),
    ]);
    recent = (updatesR.data ?? []) as Record<string, unknown>[];
    newT = (newTasksR.data ?? []) as Record<string, unknown>[];
  } catch { /* partial is fine */ }

  const rows: SmartRow[] = [];

  // 1) Radar findings — the concerns, worst-first (buildRadar already sorts).
  for (const f of findings.slice(0, 4)) {
    rows.push({ label: f.label, sub: f.detail, badge: null, tone: f.tone as SmartTone, href: f.href });
  }
  // 2) Recent activity — a couple of "what changed" lines.
  for (const u of recent.slice(0, 2)) {
    const t = u.tasks as { code?: string } | { code?: string }[] | null;
    const code = (Array.isArray(t) ? t[0]?.code : t?.code) ?? "?";
    rows.push({ label: `${authorOf(u.created_by as string | null)} updated [${code}]`, sub: ((u.body as string) ?? "").trim().replace(/\s+/g, " ").slice(0, 70) || null, badge: agoLabel(u.created_at as string), tone: "muted", href: code !== "?" ? `/task/${code}` : "/?tab=timeline" });
  }
  for (const t of newT.slice(0, 2)) {
    rows.push({ label: `New [${t.code}]`, sub: (t.action_item as string) ?? null, badge: agoLabel(t.created_date as string), tone: "accent", href: `/task/${t.code}` });
  }

  const concerns = findings.length;
  const note = concerns === 0
    ? "All clear on the radar — nothing overdue, stuck or slipping."
    : `${concerns} thing${concerns === 1 ? "" : "s"} on the radar · ${recent.length + newT.length} recent change${recent.length + newT.length === 1 ? "" : "s"}`;
  if (rows.length === 0) return { kind: "count", title: "Your briefing", count: 0, rows: [], note: "Nothing needs you and nothing's changed recently — quiet day.", href: "/" };
  return { kind: "count", title: "Your briefing", count: concerns, rows: rows.slice(0, MAX_ROWS), note, href: "/" };
}

/** SAVE MACRO — "save macro <name>: <steps>" (or "save routine …"). Stores a
 *  named natural-language step list in ai_memory (kind="macro") so it can be
 *  recalled + confirmed later. No AI. */
async function saveMacroAnswer(_q: string, raw: string): Promise<SmartAnswer | null> {
  const m = raw.match(/^\s*(?:save|create|new|define)\s+(?:macro|routine)\s+([^:]+?)\s*[:=]\s*([\s\S]+)$/i);
  if (!m) return null;
  const name = m[1].trim().replace(/\s+/g, " ");
  const steps = m[2].trim().replace(/\s+/g, " ");
  if (!name || !steps) return null;
  const { rememberMacro } = await import("@/lib/ai-memory");
  const ok = await rememberMacro("admin", name, steps);
  return {
    kind: "count",
    title: ok ? `Saved macro “${name}”` : `Couldn't save “${name}”`,
    count: ok ? 1 : 0,
    rows: [{ label: name, sub: steps.slice(0, 120), badge: "macro", tone: ok ? "success" : "danger", href: "/" }],
    note: ok ? "Run it with “run macro " + name + "”. ORI will confirm the steps before executing." : "Storage failed — try again.",
  };
}

/** RUN / LIST MACROS — "run macro <name>", "do my <name> routine", "list macros".
 *  Reads the stored steps back as a card; NOTE the actual execution is the agent's
 *  job — this surfaces + explains the macro so the owner can confirm it. */
async function runMacroAnswer(q: string, raw: string): Promise<SmartAnswer | null> {
  const listing = /\b(list|show|my)\s+macros\b|\bwhat macros\b|\bmacros i('ve| have)\b/i.test(q);
  const runM = raw.match(/^\s*(?:run|do|execute|play|start)\s+(?:my\s+)?(?:macro\s+)?(.+?)\s*(?:routine|macro)?\s*$/i);
  if (!listing && !(runM && /\b(macro|routine)\b/i.test(q))) return null;

  const { listMacros, findMacro } = await import("@/lib/ai-memory");

  if (listing) {
    const all = await listMacros("admin");
    if (all.length === 0) return { kind: "count", title: "No saved macros", count: 0, rows: [], note: "Save one with “save macro <name>: <steps>”." };
    const rows: SmartRow[] = all.slice(0, MAX_ROWS).map((m) => ({ label: m.name, sub: (m.steps ?? "").slice(0, 120), badge: "macro", tone: "accent" as SmartTone, href: "/" }));
    return { kind: "count", title: "Saved macros", count: all.length, rows, note: "Run one with “run macro <name>”." };
  }

  const name = (runM?.[1] ?? "").trim().replace(/\b(macro|routine)\b/gi, "").trim();
  if (!name) return null;
  const macro = await findMacro("admin", name);
  if (!macro) return { kind: "count", title: `No macro “${name}”`, count: 0, rows: [], note: "List them with “list macros”, or save one with “save macro <name>: <steps>”." };
  const steps = (macro.steps ?? "").split(/\s*(?:;|→|\d+\.|\n)\s*/).map((s) => s.trim()).filter(Boolean);
  const rows: SmartRow[] = steps.slice(0, MAX_ROWS).map((s, i) => ({ label: `${i + 1}. ${s}`, sub: null, badge: null, tone: "muted" as SmartTone, href: "/" }));
  if (rows.length === 0) rows.push({ label: macro.steps ?? "", sub: null, badge: null, tone: "muted", href: "/" });
  return {
    kind: "count",
    title: `Macro “${macro.name}”`,
    count: rows.length,
    rows,
    note: "Ask ORI to “run macro " + macro.name + "” in chat — it'll confirm these steps before executing.",
  };
}

/** SCHEDULE MACRO — "schedule macro <name> every monday [at 9]", "run <name>
 *  weekly", "schedule <name> monthly on the 1st". Creates a scheduled_macro
 *  automation_rules row (config = { macroName, weekday|dayOfMonth, hour }) that the
 *  ori-automations cron surfaces at the due time for the owner to confirm + run.
 *  It never auto-executes the macro. No AI; reuses the saved-macro read. */
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
async function scheduleMacroAnswer(q: string, raw: string): Promise<SmartAnswer | null> {
  // Must look like a scheduling instruction that mentions a cadence.
  if (!/\b(schedule|run|do|execute)\b/i.test(raw)) return null;
  if (!/\b(every|each|weekly|monthly|daily|on\s+(?:the\s+)?\w+)\b/i.test(raw)) return null;

  // Name: between the verb (and optional "macro"/"routine") and the cadence clause.
  const m = raw.match(
    /^\s*(?:schedule|run|do|execute)\s+(?:my\s+)?(?:macro\s+|routine\s+)?(.+?)\s+(?:every|each|weekly|monthly|daily|on\b)/i,
  );
  let name = (m?.[1] ?? "").trim().replace(/\b(macro|routine)\b/gi, "").trim();
  if (!name) return null;

  // Cadence + hour.
  const hourM = raw.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hour: number | undefined;
  if (hourM) {
    let h = Number(hourM[1]);
    const ap = (hourM[3] ?? "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) hour = h;
  }

  const config: Record<string, unknown> = { macroName: name };
  let cadenceLabel: string;
  const dayM = raw.match(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i);
  const weekdayM = raw.match(/\b(?:every|each|on)\s+(sunday|sun|monday|mon|tuesday|tues?|wednesday|wed|thursday|thur?s?|friday|fri|saturday|sat)\b/i);
  if (/\bmonthly\b/i.test(raw) || (dayM && !weekdayM)) {
    const dom = dayM ? Math.min(31, Math.max(1, Number(dayM[1]))) : 1;
    config.dayOfMonth = dom;
    cadenceLabel = `on day ${dom} of each month`;
  } else if (weekdayM) {
    const wd = WEEKDAYS[weekdayM[1].toLowerCase()] ?? 1;
    config.weekday = wd;
    cadenceLabel = `every ${Object.keys(WEEKDAYS).find((k) => WEEKDAYS[k] === wd && k.length > 3) ?? "Monday"}`;
  } else if (/\b(weekly|daily|every\s+week)\b/i.test(raw)) {
    config.weekday = 1;
    cadenceLabel = "every Monday";
  } else {
    return null; // no recognisable cadence
  }
  if (hour != null) config.hour = hour;

  // Confirm the macro exists before scheduling (best-effort; still schedule if the
  // read fails, so a transient error doesn't block the owner).
  let matchedName = name;
  try {
    const { findMacro } = await import("@/lib/ai-memory");
    const macro = await findMacro("admin", name);
    if (macro) { matchedName = macro.name; config.macroName = macro.name; name = macro.name; }
    else return { kind: "count", title: `No macro “${name}”`, count: 0, rows: [], note: "Save it first with “save macro <name>: <steps>”, then schedule it." };
  } catch { /* proceed with the raw name */ }

  const when = `${cadenceLabel}${hour != null ? ` at ${String(hour).padStart(2, "0")}:00` : " at 09:00"}`;
  try {
    const { error } = await sb.from("automation_rules").insert({
      kind: "scheduled_macro", config, active: true, done: false, created_at: new Date().toISOString(),
    });
    if (error) return { kind: "count", title: "Couldn't schedule the macro", count: 0, rows: [], note: "Storage failed — try again." };
  } catch {
    return { kind: "count", title: "Couldn't schedule the macro", count: 0, rows: [], note: "Storage failed — try again." };
  }
  return {
    kind: "count",
    title: `Scheduled “${matchedName}”`,
    count: 1,
    rows: [{ label: matchedName, sub: when, badge: "scheduled", tone: "success", href: "/" }],
    note: `ORI will surface these steps ${when} for you to confirm + run — it won't auto-execute them.`,
  };
}

/** The one entry point — tries each intent in priority order, returns the first
 *  that answers. Bounded + best-effort: any failure just yields null. */
export async function resolveSmartAnswer(query: string): Promise<SmartAnswer | null> {
  const raw = (query ?? "").trim();
  const q = raw.toLowerCase();
  if (q.length < 3) return null;

  // Macros need the ORIGINAL casing (name + steps), so run them first with `raw`.
  // Scheduling ("run X weekly") must beat the plain runMacroAnswer.
  try {
    const saved = await saveMacroAnswer(q, raw); if (saved) return saved;
    const scheduled = await scheduleMacroAnswer(q, raw); if (scheduled) return scheduled;
    const ran = await runMacroAnswer(q, raw); if (ran) return ran;
  } catch { /* fall through to the standard resolvers */ }

  const resolvers = [
    briefingAnswer,
    oriActionsAnswer,
    radarAnswer,
    // Oversight — estate-wide "what happened" digest + per-entity activity.
    // Ahead of the generic count/overdue resolvers so activity phrasing wins.
    whatHappenedAnswer, entityActivityAnswer,
    // Workload BEFORE the leaderboards so "overloaded / distribution / balance /
    // who has the most tasks" resolve to the spread card, not a bare ranking.
    compareAnswer, workloadAnswer, mostOverdueByPersonAnswer, mostTasksByPersonAnswer,
    // Portal analytics (owner scope) — ahead of the per-person engagement card so
    // "leaderboard / who hasn't logged in / most-used pages / who hasn't acked" win.
    announcementAckAnswer, engagementLeaderboardAnswer, inactiveStaffAnswer, pageUsageAnswer,
    performanceAnswer, engagementAnswer,
    leaveAnswer, companyComplianceAnswer, missingDocAnswer, docExpiryAnswer,
    overdueTasksAnswer, dueTasksAnswer, recentlyUpdatedTasksAnswer, probationAnswer, assetsAnswer,
    tasksByPersonAnswer, countAnswer,
  ];
  for (const r of resolvers) {
    try { const a = await r(q); if (a) return a; } catch { /* try the next */ }
  }
  return null;
}
