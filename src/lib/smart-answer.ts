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

/** Match a company named in the query to its id (name / legal name / prefix). */
async function matchCompany(q: string): Promise<{ id: number; name: string } | null> {
  const { data } = await sb.from("companies").select("id,name,legal_name,file_prefix,code_prefix").eq("active", true);
  const lower = q.toLowerCase();
  let best: { id: number; name: string; len: number } | null = null;
  for (const c of (data ?? []) as Record<string, unknown>[]) {
    for (const cand of [c.name, c.legal_name, c.file_prefix, c.code_prefix]) {
      const s = String(cand ?? "").toLowerCase().trim();
      if (s.length >= 2 && lower.includes(s) && (!best || s.length > best.len)) {
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

/** The one entry point — tries each intent in priority order, returns the first
 *  that answers. Bounded + best-effort: any failure just yields null. */
export async function resolveSmartAnswer(query: string): Promise<SmartAnswer | null> {
  const q = (query ?? "").toLowerCase().trim();
  if (q.length < 3) return null;
  const resolvers = [leaveAnswer, docExpiryAnswer, overdueTasksAnswer, dueTasksAnswer, countAnswer];
  for (const r of resolvers) {
    try { const a = await r(q); if (a) return a; } catch { /* try the next */ }
  }
  return null;
}
