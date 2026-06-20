// Scannable activity log — one timeline that answers "did the SYSTEM do this, or
// did a person?". It unifies four already-existing streams into typed rows, each
// tagged with an actor (system / you / staff) so the owner can filter to "System
// only" and confirm at a glance what ran on its own. Read-only; no new tables.
//   • automation_events   → process moves the system applied (compliance, pipeline…)
//   • profile_suggestions → record changes the system applied
//   • audit_log           → task/record edits (actor from created_by)
//   • system_events       → cron runs, document filings, self-heal, emails

import { sb } from "@/db/supabase";

export type Actor = "system" | "you" | "staff";

export type ActivityRow = {
  key: string;
  actor: Actor;
  actorLabel: string;     // "System" | "You" | the staff member's name
  summary: string;        // plain-language what happened
  detail: string | null;  // the "why" / context
  when: Date;
  href?: string | null;   // where to look
};

/** Deterministic labels computed once on the server (so the client renders the
 *  exact same strings — no locale-dependent hydration mismatch). */
export function formatTimeLabel(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function formatDayLabel(d: Date, now: Date = new Date()): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (diff < 7) return DAYS[d.getDay()];
  const y = now.getFullYear() === d.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`;
}

/** Map a created_by discriminator to who really did it. */
export function classifyActor(createdBy: string | null | undefined): { actor: Actor; label: string } {
  const by = (createdBy ?? "").trim();
  if (/^portal-?(dir|mgr|hr)?:/i.test(by)) {
    const name = by.split(":").slice(1).join(":").trim();
    return { actor: "staff", label: name || "Staff" };
  }
  if (by === "" || /^(ai-|automation|cron|dropbox|system|meeting-mode$|capture$)/i.test(by)) {
    // ai-intake/ai-command/automation/cron/dropbox and unstamped = the system itself.
    // (capture = quick-capture wizard, owner-driven but logged as a system assist.)
    return /^capture$/i.test(by) ? { actor: "you", label: "You" } : { actor: "system", label: "System" };
  }
  return { actor: "you", label: "You" }; // web-ui = the owner in the admin app
}

// system_events that are noise for an activity log (diagnostics / heartbeats).
const SYSTEM_EVENT_NOISE = new Set(["heartbeat", "doc-extraction"]);

// Friendly labels for the system_events we DO show.
function systemEventSummary(kind: string, d: Record<string, unknown>): { summary: string; detail: string | null; href?: string | null } {
  const s = (v: unknown) => (v == null ? null : String(v));
  switch (kind) {
    case "documents.filed":
      return { summary: `Filed "${s(d.title) ?? "a document"}"${d.owner ? ` to ${s(d.owner)}` : ""}`, detail: s(d.reason), href: d.docId ? `/documents?doc=${d.docId}` : "/documents" };
    case "documents.quarantine":
      return { summary: `Held "${s(d.title) ?? "a document"}" for review`, detail: s(d.reason), href: "/inbox" };
    case "documents.selfheal":
      return { summary: `Self-healed documents`, detail: `re-read ${s(d.healedText) ?? 0}, re-owned ${s(d.filedOwner) ?? 0}`, href: "/documents" };
    case "dropbox.sync":
      return { summary: `Pulled new files from Dropbox`, detail: d.pulled ? `${s(d.pulled)} file(s)` : null, href: "/inbox" };
    case "cron.morning":
      return { summary: `Ran the morning routine`, detail: null };
    case "cron.notify":
    case "cron.reminders":
      return { summary: `Sent due reminders`, detail: null, href: "/outbox" };
    case "cron.snapshots":
      return { summary: `Took the daily snapshot`, detail: null };
    case "cron.cleanup":
      return { summary: `Tidied up old data`, detail: null };
    case "cron.reindex":
      return { summary: `Re-indexed for search`, detail: null };
    case "system.health":
      // status:ok rows are the calm "all healthy" heartbeat; only the error rows
      // are a flagged problem. (The "— failed" suffix is added by the caller for
      // error rows, so keep the summary status-neutral here.)
      return Array.isArray(d.down) && (d.down as string[]).length
        ? { summary: `Flagged a system-health problem`, detail: (d.down as string[]).join("; "), href: "/inbox" }
        : { summary: `Checked system health — all ${s(d.healthy) ?? "jobs"} healthy`, detail: d.repaired ? `auto-fixed ${s(d.repaired)}` : null, href: "/inbox" };
    case "system.repair":
      return { summary: `Self-repaired a stalled job (${s(d.job) ?? "a job"})`, detail: s(d.message), href: "/inbox" };
    case "system.repaired":
      return { summary: `Auto-fixed ${Array.isArray(d.jobs) ? (d.jobs as string[]).join(", ") : "a job"}`, detail: null, href: "/inbox" };
    case "automation.time":
      return { summary: `Created scheduled work that came due`, detail: s(d.summary), href: "/" };
    case "portal.access.granted":
      return { summary: `Granted portal access`, detail: s(d.name), href: "/settings" };
    case "portal.access.revoked":
      return { summary: `Revoked portal access`, detail: s(d.name), href: "/settings" };
    case "portal.role.changed":
      return { summary: `Changed a portal role`, detail: s(d.name), href: "/settings" };
    default:
      if (kind.startsWith("email.automation.")) return { summary: `Sent an automated email (${kind.replace("email.automation.", "")})`, detail: null, href: "/outbox" };
      if (kind.startsWith("portal.")) return { summary: kind.replace(/\./g, " "), detail: null };
      return { summary: kind.replace(/\./g, " "), detail: null };
  }
}

function auditSummary(r: { entry_type: string | null; field: string | null; change_reason: string | null; task_code: string | null }): string {
  const where = r.task_code ? ` ${r.task_code}` : "";
  if (r.entry_type === "CREATE") return `Created${where || " a record"}`;
  if (r.field) return `Changed ${r.field}${where}`;
  return `Updated${where || " a record"}`;
}

/**
 * The unified feed, newest first. `actor` filters to one stream of responsibility.
 * Each source is bounded so the merge stays cheap.
 */
export async function getActivityFeed(opts?: { actor?: Actor | "all"; limit?: number }): Promise<ActivityRow[]> {
  const limit = opts?.limit ?? 80;
  const want = opts?.actor ?? "all";
  const per = Math.min(150, Math.max(40, limit * 2));

  const [auto, recs, audit, sys] = await Promise.all([
    sb.from("automation_events").select("id,summary,detail,document_id,created_at,status").in("status", ["applied", "undone"]).order("created_at", { ascending: false }).limit(per),
    sb.from("profile_suggestions").select("id,summary,detail,document_id,created_at").eq("status", "accepted").order("created_at", { ascending: false }).limit(per),
    sb.from("audit_log").select("id,entry_type,field,change_reason,task_code,created_at,created_by").is("deleted_at", null).order("created_at", { ascending: false }).limit(per),
    sb.from("system_events").select("id,kind,status,details,created_at").order("created_at", { ascending: false }).limit(per * 2),
  ]);

  const rows: ActivityRow[] = [];

  for (const a of auto.data ?? []) {
    rows.push({ key: `ae:${a.id}`, actor: "system", actorLabel: "System", summary: (a.status === "undone" ? "Reversed: " : "") + (a.summary as string), detail: (a.detail as string | null) ?? null, when: new Date(a.created_at as string), href: a.document_id ? `/documents?doc=${a.document_id}` : null });
  }
  for (const s of recs.data ?? []) {
    rows.push({ key: `ps:${s.id}`, actor: "system", actorLabel: "System", summary: s.summary as string, detail: (s.detail as string | null) ?? null, when: new Date(s.created_at as string), href: s.document_id ? `/documents?doc=${s.document_id}` : null });
  }
  for (const r of audit.data ?? []) {
    const who = classifyActor(r.created_by as string | null);
    rows.push({ key: `al:${r.id}`, actor: who.actor, actorLabel: who.label, summary: auditSummary(r as never), detail: (r.change_reason as string | null) ?? null, when: new Date(r.created_at as string), href: r.task_code ? `/task/${r.task_code}` : null });
  }
  for (const e of sys.data ?? []) {
    const kind = e.kind as string;
    if (SYSTEM_EVENT_NOISE.has(kind)) continue;
    let d: Record<string, unknown> = {};
    try { d = e.details ? JSON.parse(e.details as string) : {}; } catch { /* keep empty */ }
    const m = systemEventSummary(kind, d);
    rows.push({ key: `se:${e.id}`, actor: "system", actorLabel: "System", summary: m.summary + (e.status === "error" ? " — failed" : ""), detail: m.detail, when: new Date(e.created_at as string), href: m.href ?? null });
  }

  const filtered = want === "all" ? rows : rows.filter((r) => r.actor === want);
  filtered.sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
  return filtered.slice(0, limit);
}
