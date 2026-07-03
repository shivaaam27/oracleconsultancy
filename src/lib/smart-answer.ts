import { sb } from "@/db/supabase";
import { bestDocType, deriveFiling } from "@/lib/doc-catalog";

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

/** The one entry point — tries each intent in priority order, returns the first
 *  that answers. Bounded + best-effort: any failure just yields null. */
export async function resolveSmartAnswer(query: string): Promise<SmartAnswer | null> {
  const q = (query ?? "").toLowerCase().trim();
  if (q.length < 3) return null;
  const resolvers = [
    leaveAnswer, companyComplianceAnswer, missingDocAnswer, docExpiryAnswer,
    overdueTasksAnswer, dueTasksAnswer, probationAnswer, assetsAnswer, countAnswer,
  ];
  for (const r of resolvers) {
    try { const a = await r(q); if (a) return a; } catch { /* try the next */ }
  }
  return null;
}
