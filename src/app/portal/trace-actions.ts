"use server";

import { sb } from "@/db/supabase";
import { getPortalPerson, personCanSeePerson, personCanSeeTask } from "@/lib/portal-auth";

/* ─────────────────────────────────────────────────────────────────────────
 * Portal Trace — a SMALL, scoped "history" trail for the two entity types the
 * staff portal can open: a task and a person.
 *
 * This is the portal twin of the admin `/api/trace` route, but it is its own
 * self-contained thing: it re-verifies the portal session AND the entity gate
 * (can this viewer even see this task/person?) before reading anything, and it
 * only touches the safe per-entity history tables — never the broad audit/
 * automation surfaces an admin sees. If the viewer may open the entity, its own
 * history is fine to show them.
 *
 * Resilient by design: it never throws. Any failure (no session, denied, a
 * missing table) returns { ok: false }; a single source erroring just drops that
 * source. British English throughout.
 * ───────────────────────────────────────────────────────────────────────── */

export type PortalTraceEvent = {
  at: string;        // ISO timestamp
  kind: string;      // short category chip, e.g. "Update", "Change"
  title: string;     // one-line summary
  detail?: string;   // optional context
  by?: string;       // actor, friendly name
};

export type PortalTraceResult =
  | { ok: false }
  | { ok: true; label: string; events: PortalTraceEvent[] };

const MAX_EVENTS = 60;

// Friendly actor name from a stored created_by / decided_by token. Mirrors the
// portal task page's authorOf so the language reads the same.
function actorOf(by: string | null | undefined): string | undefined {
  if (!by) return undefined;
  if (by === "web-ui") return "Management";
  if (by === "ai-command") return "ORI";
  if (by === "meeting-mode") return "Meeting";
  if (by.startsWith("portal-dir:")) return by.slice("portal-dir:".length);
  if (by.startsWith("portal-mgr:")) return by.slice("portal-mgr:".length);
  if (by.startsWith("portal:")) return by.slice("portal:".length);
  return by;
}

// Coerce any stored timestamp to an ISO string we can sort/render; null = skip.
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
  status: "Status",
  priority: "Priority",
  deadline: "Deadline",
  owner: "Owner",
  owner_id: "Owner",
};

/** Person fields the portal deliberately keeps admin-only (national ID, passport,
 *  date of birth, home address, emergency contacts, pay, nationality). The portal
 *  person page redacts these, so their change events must NEVER surface in the
 *  portal History either — otherwise a manager could read a report's passport or
 *  home address from the trail. Matches both the admin audit labels ("National
 *  ID", "Passport no.") and the portal self-edit keys ("emergencyContactName"). */
function isSensitivePersonField(field: string | null | undefined): boolean {
  if (!field) return false;
  const f = field.toLowerCase().replace(/[^a-z]/g, "");
  if (f.startsWith("emergency")) return true; // emergency contact name/phone
  return (
    f.includes("nationalid") ||
    f.includes("passport") ||
    f.includes("dateofbirth") || f === "dob" ||
    f.includes("address") || // home address (not "email" — that normalises to "email")
    f.includes("nationality") ||
    f.includes("salary") || f.includes("wage") || f === "pay" || f.includes("paygrade") ||
    f.includes("staffcategory")
  );
}

export async function portalTrace(
  kind: "task" | "person",
  id: number
): Promise<PortalTraceResult> {
  try {
    const me = await getPortalPerson();
    if (!me) return { ok: false };
    if (!Number.isFinite(id) || id <= 0) return { ok: false };

    // Entity gate FIRST — never read history for an entity the viewer can't see.
    if (kind === "task") {
      if (!(await personCanSeeTask(me, id))) return { ok: false };
      const { label, events } = await traceTask(id);
      return { ok: true, label, events: finalise(events) };
    }
    if (kind === "person") {
      if (!(await personCanSeePerson(me, id))) return { ok: false };
      const { label, events } = await tracePerson(id);
      return { ok: true, label, events: finalise(events) };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// Sort newest-first and cap.
function finalise(events: PortalTraceEvent[]): PortalTraceEvent[] {
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events.slice(0, MAX_EVENTS);
}

/* ── TASK ────────────────────────────────────────────────────────────────── */

async function traceTask(id: number): Promise<{ label: string; events: PortalTraceEvent[] }> {
  const events: PortalTraceEvent[] = [];
  let label = `Task #${id}`;
  let code: string | null = null;

  await safely(async () => {
    const { data } = await sb
      .from("tasks")
      .select("id,code,action_item,created_date,closed_date,status")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      code = (data.code as string | null) ?? null;
      label = code ? code : (data.action_item as string) || label;
      const created = iso(data.created_date);
      if (created) events.push({ at: created, kind: "Created", title: "Task created", detail: code ?? undefined });
      const closed = iso(data.closed_date);
      if (closed) events.push({ at: closed, kind: "Closed", title: `Task ${(data.status as string) || "closed"}` });
    }
  });

  // Body posts (the conversation).
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

  // Field changes (status / priority / deadline / owner) from the audit log.
  if (code) {
    await safely(async () => {
      const { data } = await sb
        .from("audit_log")
        .select("field,old_value,new_value,entry_type,created_at,created_by")
        .eq("task_code", code)
        .eq("entry_type", "CHANGE")
        .in("field", ["status", "priority", "deadline", "owner", "owner_id"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS);
      for (const a of data ?? []) {
        const at = iso(a.created_at);
        if (!at) continue;
        const field = String(a.field ?? "");
        const fieldLabel = FIELD_LABELS[field] ?? (field ? field.charAt(0).toUpperCase() + field.slice(1) : "Changed");
        const nvRaw = (a.new_value as string | null) ?? "";
        const ovRaw = (a.old_value as string | null) ?? "";
        const nv = field === "deadline" && nvRaw ? fmtDate(nvRaw) : nvRaw;
        const ov = field === "deadline" && ovRaw ? fmtDate(ovRaw) : ovRaw;
        events.push({
          at,
          kind: "Change",
          title: nv ? `${fieldLabel} → ${nv}` : `${fieldLabel} cleared`,
          detail: ov ? `was ${ov}` : undefined,
          by: actorOf(a.created_by as string | null),
        });
      }
    });
  }

  return { label, events };
}

/* ── PERSON ──────────────────────────────────────────────────────────────── */

async function tracePerson(id: number): Promise<{ label: string; events: PortalTraceEvent[] }> {
  const events: PortalTraceEvent[] = [];
  let label = `Person #${id}`;

  await safely(async () => {
    const { data } = await sb.from("people").select("id,name,role").eq("id", id).maybeSingle();
    if (data?.name) label = data.name as string;
  });

  // person_events — the canonical per-person trail (created/updated/archived/…).
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
      enriched: "Updated",
      snoozed: "Snoozed",
      unsnoozed: "Unsnoozed",
    };
    for (const e of data ?? []) {
      const at = iso(e.created_at);
      if (!at) continue;
      const action = String(e.action ?? "");
      const field = e.field as string | null;
      // Never expose a redacted PII field's value (or even that it changed) in
      // the portal — mirror exactly what the portal person page hides.
      if (isSensitivePersonField(field)) continue;
      const nv = (e.new_value as string | null) ?? "";
      const ov = (e.old_value as string | null) ?? "";
      let title: string;
      if (action === "updated" && field) title = nv ? `${field} → ${nv}` : `${field} cleared`;
      else title = ACTION_LABEL[action] ?? action ?? "Changed";
      // An "enriched" (smart-intake) event stores a comma-list of the field NAMES
      // it filled in its `detail` — which can include redacted fields ("National
      // ID, Passport no."). Drop that raw detail so the portal trail never even
      // names the hidden fields; the generic "Updated" marker is enough.
      const rawDetail = action === "enriched" ? null : ((e.detail as string | null) || null);
      events.push({
        at,
        kind: ACTION_LABEL[action] ?? "Change",
        title,
        detail: [ov && action === "updated" ? `was ${ov}` : null, rawDetail]
          .filter(Boolean)
          .join(" · ") || undefined,
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
      const assetLabel = asset ? [asset.tag, asset.name].filter(Boolean).join(" ") || "equipment" : "equipment";
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
      if (returned) events.push({ at: returned, kind: "Asset", title: `Returned ${assetLabel}` });
    }
  });

  return { label, events };
}
