import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getTraceDef } from "@/lib/entity-registry";

export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────────────────
 * Trace — the full chronological trail of any entity.
 *
 * GET /api/trace?type=<entityType>&id=<number>
 *
 * Pulls every relevant history source for the entity, normalises each into a
 * common TraceEvent shape, and returns them newest-first. Resilient by design:
 * every source is wrapped so a missing table or a query error never 500s the
 * whole response — we return whatever we could gather. British English.
 * ───────────────────────────────────────────────────────────────────────── */

export type TraceEvent = {
  at: string;        // ISO timestamp
  kind: string;      // short category chip, e.g. "Update", "Field change"
  title: string;     // one-line summary
  detail?: string;   // optional context
  by?: string;       // actor, friendly name
};

type TraceResult = {
  type: string;
  id: number;
  label: string;
  events: TraceEvent[];
};

const MAX_EVENTS = 200;

// Friendly actor name from a stored createdBy / created_by token.
function actorOf(by: string | null | undefined): string | undefined {
  if (!by) return undefined;
  if (by === "web-ui") return "You";
  if (by === "ai-command") return "ORI";
  if (by === "ai-intake" || by === "intake") return "Smart intake";
  if (by === "meeting-mode") return "Meeting";
  if (by === "automation" || by === "recurring") return "System";
  if (by.startsWith("portal-dir:")) return by.slice("portal-dir:".length);
  if (by.startsWith("portal-mgr:")) return by.slice("portal-mgr:".length);
  if (by.startsWith("portal:")) return by.slice("portal:".length);
  return by;
}

// Coerce any stored timestamp to an ISO string we can sort/render. Returns null
// for blanks so the caller can skip the event.
function iso(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function fmtDate(v: unknown): string {
  const s = iso(v);
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Run a source-gathering step without ever letting it throw the whole request.
async function safely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    /* partial data is fine — skip this source */
  }
}

const FIELD_LABELS: Record<string, string> = {
  role: "Role",
  manager_id: "Manager",
  managerId: "Manager",
  company_id: "Company",
  department_id: "Department",
  status: "Status",
  priority: "Priority",
  deadline: "Deadline",
  risk: "Risk",
  escalation: "Escalation",
};

export async function GET(req: NextRequest) {
  const type = (req.nextUrl.searchParams.get("type") || "").trim().toLowerCase();
  const id = Number(req.nextUrl.searchParams.get("id"));

  if (!type || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Provide a valid ?type= and numeric ?id=." }, { status: 400 });
  }

  const events: TraceEvent[] = [];
  let label = `${type.charAt(0).toUpperCase()}${type.slice(1)} #${id}`;

  switch (type) {
    case "task":
      label = await traceTask(id, events);
      break;
    case "person":
      label = await tracePerson(id, events);
      break;
    case "company":
      label = await traceCompany(id, events);
      break;
    case "document":
      label = await traceDocument(id, events);
      break;
    default:
      label = await traceGeneric(type, id, events);
      break;
  }

  // Newest first, bounded.
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const result: TraceResult = { type, id, label, events: events.slice(0, MAX_EVENTS) };
  return NextResponse.json(result);
}

/* ── TASK ────────────────────────────────────────────────────────────────── */

async function traceTask(id: number, events: TraceEvent[]): Promise<string> {
  let label = `Task #${id}`;
  let code: string | null = null;

  await safely(async () => {
    const { data } = await sb
      .from("tasks")
      .select("id,code,action_item,created_date,created_at,closed_date,status")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      code = (data.code as string | null) ?? null;
      label = code ? `${code} · ${(data.action_item as string) ?? ""}`.trim() : (data.action_item as string) || label;
      const created = iso(data.created_date) ?? iso((data as Record<string, unknown>).created_at);
      if (created) {
        events.push({ at: created, kind: "Created", title: "Task created", detail: code ?? undefined });
      }
      const closed = iso(data.closed_date);
      if (closed) {
        events.push({ at: closed, kind: "Closed", title: `Task ${(data.status as string) || "closed"}` });
      }
    }
  });

  // Updates (conversation / progress notes).
  await safely(async () => {
    const { data } = await sb
      .from("task_updates")
      .select("body,created_at,created_by")
      .eq("task_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);
    for (const u of data ?? []) {
      const at = iso(u.created_at);
      if (!at) continue;
      events.push({
        at,
        kind: "Update",
        title: (u.body as string) || "(update)",
        by: actorOf(u.created_by as string | null),
      });
    }
  });

  // Audit-log changes referencing the task (by code).
  if (code) {
    await safely(async () => {
      const { data } = await sb
        .from("audit_log")
        .select("field,old_value,new_value,change_reason,entry_type,created_at,created_by")
        .eq("task_code", code)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS);
      for (const a of data ?? []) {
        const at = iso(a.created_at);
        if (!at) continue;
        const field = String(a.field ?? "");
        const fieldLabel = FIELD_LABELS[field] ?? (field ? field.charAt(0).toUpperCase() + field.slice(1) : "Changed");
        const nv = (a.new_value as string | null) ?? "";
        const ov = (a.old_value as string | null) ?? "";
        events.push({
          at,
          kind: "Change",
          title: nv ? `${fieldLabel} → ${nv}` : `${fieldLabel} cleared`,
          detail: [ov ? `was ${ov}` : null, (a.change_reason as string | null) || null].filter(Boolean).join(" · ") || undefined,
          by: actorOf(a.created_by as string | null),
        });
      }
    });
  }

  return label;
}

/* ── PERSON ──────────────────────────────────────────────────────────────── */

async function tracePerson(id: number, events: TraceEvent[]): Promise<string> {
  let label = `Person #${id}`;

  await safely(async () => {
    const { data } = await sb.from("people").select("id,name,role").eq("id", id).maybeSingle();
    if (data?.name) label = (data.name as string) + ((data.role as string | null) ? ` · ${data.role}` : "");
  });

  // person_events — the canonical per-person audit trail.
  await safely(async () => {
    const { data } = await sb
      .from("person_events")
      .select("action,field,old_value,new_value,detail,created_at,created_by")
      .eq("person_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);
    const ACTION_LABEL: Record<string, string> = {
      created: "Created",
      updated: "Changed",
      archived: "Archived",
      restored: "Restored",
      enriched: "Profile enriched",
      snoozed: "Snoozed reminders",
      unsnoozed: "Cleared snooze",
    };
    for (const e of data ?? []) {
      const at = iso(e.created_at);
      if (!at) continue;
      const action = String(e.action ?? "");
      const field = e.field as string | null;
      const nv = (e.new_value as string | null) ?? "";
      const ov = (e.old_value as string | null) ?? "";
      let title: string;
      if (action === "updated" && field) title = nv ? `${field} → ${nv}` : `${field} cleared`;
      else title = ACTION_LABEL[action] ?? action ?? "Changed";
      events.push({
        at,
        kind: ACTION_LABEL[action] ?? "Change",
        title,
        detail: [ov && action === "updated" ? `was ${ov}` : null, (e.detail as string | null) || null].filter(Boolean).join(" · ") || undefined,
        by: actorOf(e.created_by as string | null),
      });
    }
  });

  // Leave requests — applied / decided.
  await safely(async () => {
    const { data } = await sb
      .from("leave_requests")
      .select("id,start_date,end_date,days,status,reason,decided_by,decided_at,created_at,created_by,leave_types(name)")
      .eq("person_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);
    for (const lr of data ?? []) {
      const typeName = (lr.leave_types as unknown as { name?: string } | null)?.name || "Leave";
      const span = `${fmtDate(lr.start_date)} – ${fmtDate(lr.end_date)}`;
      const days = lr.days != null ? `${lr.days} day${Number(lr.days) === 1 ? "" : "s"}` : "";
      // Applied.
      const created = iso(lr.created_at);
      if (created) {
        events.push({
          at: created,
          kind: "Leave",
          title: `${typeName} requested`,
          detail: [span, days, (lr.reason as string | null) || null].filter(Boolean).join(" · ") || undefined,
          by: actorOf(lr.created_by as string | null),
        });
      }
      // Decision (approved / rejected / cancelled).
      const decided = iso(lr.decided_at);
      if (decided && lr.status && lr.status !== "Pending") {
        events.push({
          at: decided,
          kind: "Leave",
          title: `${typeName} ${String(lr.status).toLowerCase()}`,
          detail: span,
          by: actorOf(lr.decided_by as string | null),
        });
      }
    }
  });

  // Asset assign / return history.
  await safely(async () => {
    const { data } = await sb
      .from("asset_assignments")
      .select("assigned_at,returned_at,notes,created_by,assets(name,tag)")
      .eq("person_id", id)
      .order("assigned_at", { ascending: false })
      .limit(MAX_EVENTS);
    for (const a of data ?? []) {
      const asset = a.assets as unknown as { name?: string; tag?: string } | null;
      const assetLabel = asset ? [asset.tag, asset.name].filter(Boolean).join(" ") || "Asset" : "Asset";
      const assigned = iso(a.assigned_at);
      if (assigned) {
        events.push({
          at: assigned,
          kind: "Asset",
          title: `Assigned ${assetLabel}`,
          detail: (a.notes as string | null) || undefined,
          by: actorOf(a.created_by as string | null),
        });
      }
      const returned = iso(a.returned_at);
      if (returned) {
        events.push({ at: returned, kind: "Asset", title: `Returned ${assetLabel}` });
      }
    }
  });

  return label;
}

/* ── COMPANY ─────────────────────────────────────────────────────────────── */

async function traceCompany(id: number, events: TraceEvent[]): Promise<string> {
  let label = `Company #${id}`;

  await safely(async () => {
    const { data } = await sb.from("companies").select("id,name").eq("id", id).maybeSingle();
    if (data?.name) label = data.name as string;
  });

  // Fact ledger over time — the company's verifiable record, append-only.
  await safely(async () => {
    const { data } = await sb
      .from("facts")
      .select("field,display,value,effective_date,source,verified,created_at,created_by")
      .eq("company_id", id)
      .order("effective_date", { ascending: false })
      .limit(MAX_EVENTS);
    for (const f of data ?? []) {
      // Prefer the effective date (when the fact became true); fall back to created.
      const at = iso(f.effective_date) ?? iso((f as Record<string, unknown>).created_at);
      if (!at) continue;
      const display = (f.display as string | null) || (typeof f.value === "string" ? (f.value as string) : "");
      events.push({
        at,
        kind: "Fact",
        title: `${(f.field as string) || "Fact"}${display ? `: ${display}` : ""}`,
        detail: [(f.source as string | null) || null, f.verified ? "verified" : "unverified"].filter(Boolean).join(" · ") || undefined,
        by: actorOf(f.created_by as string | null),
      });
    }
  });

  // Board resolutions.
  await safely(async () => {
    const { data } = await sb
      .from("resolutions")
      .select("date,type,summary")
      .eq("company_id", id)
      .order("date", { ascending: false })
      .limit(MAX_EVENTS);
    for (const r of data ?? []) {
      const at = iso(r.date);
      if (!at) continue;
      events.push({
        at,
        kind: "Resolution",
        title: (r.summary as string) || "Resolution",
        detail: (r.type as string | null) || undefined,
      });
    }
  });

  // Audit-log rows scoped to the company.
  await safely(async () => {
    const { data } = await sb
      .from("audit_log")
      .select("field,old_value,new_value,change_reason,task_code,created_at,created_by")
      .eq("company_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);
    for (const a of data ?? []) {
      const at = iso(a.created_at);
      if (!at) continue;
      const field = String(a.field ?? "");
      const fieldLabel = FIELD_LABELS[field] ?? (field ? field.charAt(0).toUpperCase() + field.slice(1) : "Changed");
      const nv = (a.new_value as string | null) ?? "";
      events.push({
        at,
        kind: "Audit",
        title: nv ? `${fieldLabel} → ${nv}` : fieldLabel,
        detail: [(a.task_code as string | null) || null, (a.change_reason as string | null) || null].filter(Boolean).join(" · ") || undefined,
        by: actorOf(a.created_by as string | null),
      });
    }
  });

  return label;
}

/* ── DOCUMENT ────────────────────────────────────────────────────────────── */

async function traceDocument(id: number, events: TraceEvent[]): Promise<string> {
  let label = `Document #${id}`;
  let supersedesId: number | null = null;

  await safely(async () => {
    const { data } = await sb
      .from("documents")
      .select("id,title,created_at,updated_at,archived,trashed_at,vetted_at,intake_state,intake_reason,supersedes_id,created_by,review_status")
      .eq("id", id)
      .maybeSingle();
    if (!data) return;
    label = (data.title as string) || label;
    supersedesId = (data.supersedes_id as number | null) ?? null;

    const created = iso(data.created_at);
    if (created) {
      events.push({
        at: created,
        kind: "Filed",
        title: "Document filed",
        detail: (data.intake_state as string | null) && data.intake_state !== "filed" ? `state: ${data.intake_state}` : undefined,
        by: actorOf(data.created_by as string | null),
      });
    }
    const vetted = iso(data.vetted_at);
    if (vetted) events.push({ at: vetted, kind: "Reviewed", title: "Confirmed / reviewed" });
    const updated = iso(data.updated_at);
    if (updated && updated !== created) events.push({ at: updated, kind: "Updated", title: "Document updated" });
    if (data.archived && (data.trashed_at || data.intake_state === "trash")) {
      const tat = iso(data.trashed_at) ?? updated;
      if (tat) events.push({ at: tat, kind: "Trashed", title: "Moved to Trash", detail: (data.intake_reason as string | null) || undefined });
    } else if (data.archived) {
      if (updated) events.push({ at: updated, kind: "Archived", title: "Archived", detail: (data.intake_reason as string | null) || undefined });
    }
  });

  // Renewal chain — the document this one replaces (and the one that replaces it).
  await safely(async () => {
    if (supersedesId) {
      const { data } = await sb.from("documents").select("id,title,created_at").eq("id", supersedesId).maybeSingle();
      if (data) {
        const at = iso(data.created_at);
        if (at) events.push({ at, kind: "Renewal", title: `Replaces: ${(data.title as string) || `#${supersedesId}`}` });
      }
    }
    const { data: replacedBy } = await sb
      .from("documents")
      .select("id,title,created_at")
      .eq("supersedes_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    for (const r of replacedBy ?? []) {
      const at = iso(r.created_at);
      if (at) events.push({ at, kind: "Renewal", title: `Replaced by: ${(r.title as string) || `#${r.id}`}` });
    }
  });

  // Tasks linked to the document.
  await safely(async () => {
    const { data } = await sb
      .from("document_links")
      .select("created_at,tasks(code,action_item)")
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);
    for (const l of data ?? []) {
      const at = iso(l.created_at);
      if (!at) continue;
      const task = l.tasks as unknown as { code?: string; action_item?: string } | null;
      events.push({
        at,
        kind: "Linked",
        title: `Linked to task ${task?.code ?? ""}`.trim(),
        detail: task?.action_item || undefined,
      });
    }
  });

  // Automation reactions triggered by this document's filing.
  await safely(async () => {
    const { data } = await sb
      .from("automation_events")
      .select("kind,status,summary,detail,created_at,acted_at,created_by")
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);
    for (const e of data ?? []) {
      const at = iso(e.acted_at) ?? iso(e.created_at);
      if (!at) continue;
      events.push({
        at,
        kind: "Automation",
        title: (e.summary as string) || (e.kind as string) || "Automation",
        detail: [(e.status as string | null) || null, (e.detail as string | null) || null].filter(Boolean).join(" · ") || undefined,
        by: actorOf(e.created_by as string | null),
      });
    }
  });

  return label;
}

/* ── GENERIC FALLBACK ────────────────────────────────────────────────────── */
/* letter | vendor | asset | pipeline | commitment | risk | meeting | decision —
 * pull created/updated/status info off the row, plus any audit_log /
 * system_events / automation_events that reference it.
 *
 * The type→table resolution comes from the entity registry (getTraceDef), so a
 * future entity with `trace: { mode: "generic", table }` becomes traceable here
 * automatically — no inline map to keep in sync. The registry also folds in the
 * singular/plural aliases and the non-entity decision/decisions aliases the route
 * previously hard-coded. */

async function traceGeneric(type: string, id: number, events: TraceEvent[]): Promise<string> {
  const def = getTraceDef(type);
  const table = def?.mode === "generic" ? def.table : undefined;
  let label = `${type.charAt(0).toUpperCase()}${type.slice(1)} #${id}`;

  if (table) {
    await safely(async () => {
      // Pull the row with `*` so we can read whatever timeline-ish columns exist.
      const { data } = await sb.from(table).select("*").eq("id", id).maybeSingle();
      if (!data) return;
      const row = data as Record<string, unknown>;

      // A sensible human label from common name-ish columns.
      label =
        (row.title as string) ||
        (row.name as string) ||
        (row.subject as string) ||
        (row.label as string) ||
        (row.code as string) ||
        label;

      const created = iso(row.created_at);
      if (created) {
        events.push({
          at: created,
          kind: "Created",
          title: "Created",
          detail: (row.status as string | null) || undefined,
          by: actorOf(row.created_by as string | null),
        });
      }

      // Letter issued.
      const issued = iso(row.issued_at);
      if (issued) events.push({ at: issued, kind: "Issued", title: `Issued${row.ref ? ` (${row.ref})` : ""}` });

      // A status-change signal where the row carries a status + an updatedAt that
      // differs from createdAt (best-effort — we don't have per-change history here).
      const updated = iso(row.updated_at);
      if (updated && updated !== created) {
        events.push({
          at: updated,
          kind: "Updated",
          title: row.status ? `Now: ${row.status}` : "Updated",
        });
      }

      // Decision / decided markers (decisions, commitments, etc.).
      const decided = iso(row.decided_on) ?? iso(row.decided_at);
      if (decided) events.push({ at: decided, kind: "Decision", title: `Decided${row.status ? `: ${row.status}` : ""}` });

      if (row.archived && updated) {
        events.push({ at: updated, kind: "Archived", title: "Archived" });
      }
    });
  }

  // automation_events referencing it by target table + id.
  await safely(async () => {
    if (!table) return;
    const { data } = await sb
      .from("automation_events")
      .select("kind,status,summary,detail,created_at,acted_at,created_by")
      .eq("target_table", table)
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);
    for (const e of data ?? []) {
      const at = iso(e.acted_at) ?? iso(e.created_at);
      if (!at) continue;
      events.push({
        at,
        kind: "Automation",
        title: (e.summary as string) || (e.kind as string) || "Automation",
        detail: [(e.status as string | null) || null, (e.detail as string | null) || null].filter(Boolean).join(" · ") || undefined,
        by: actorOf(e.created_by as string | null),
      });
    }
  });

  return label;
}
