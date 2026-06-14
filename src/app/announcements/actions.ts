"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { getPortalPerson, directReportIds, type PortalPerson } from "@/lib/portal-auth";
import { personRecipient, notifyMany } from "@/lib/notifications";
import {
  getAnnouncement,
  resolveAudiencePersonIds,
  markSeen as markSeenLib,
  acknowledge as acknowledgeLib,
  type AudienceKind,
  type AnnouncementType,
} from "@/lib/announcements";

type Result = { ok: true; id: number } | { ok: false; error: string };

const VALID_TYPES: AnnouncementType[] = ["policy", "holiday", "safety", "celebration", "operational", "urgent"];
const VALID_KINDS: AudienceKind[] = ["all", "company", "department", "site", "role", "person_type", "people", "managers", "directors"];
const NUMERIC_KINDS: AudienceKind[] = ["company", "department", "site", "people"];

function parseDateLocal(v: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Build the row from a form, applying the author's scope restrictions. */
type BuiltPayload = { ok: false; error: string } | { ok: true; payload: Record<string, unknown> };

async function buildPayload(fd: FormData, author: { createdBy: string; authorPersonId: number | null; manager: PortalPerson | null }): Promise<BuiltPayload> {
  const title = (fd.get("title")?.toString() ?? "").trim();
  if (!title) return { ok: false, error: "A title is required." };
  const body = (fd.get("body")?.toString() ?? "").trim();

  const type = (fd.get("type")?.toString() ?? "operational") as AnnouncementType;
  let audienceKind = (fd.get("audienceKind")?.toString() ?? "all") as AudienceKind;
  if (!VALID_TYPES.includes(type) || !VALID_KINDS.includes(audienceKind)) return { ok: false, error: "Invalid selection." };

  const rawValues = fd.getAll("audienceValues").map((v) => v.toString()).filter(Boolean);
  let audienceValues: (number | string)[] = NUMERIC_KINDS.includes(audienceKind)
    ? rawValues.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : rawValues;

  // Manager scope guard: a manager may only address their own company or their
  // direct reports. Broad audiences collapse to "their company".
  if (author.manager) {
    const m = author.manager;
    if (audienceKind === "all" || audienceKind === "managers" || audienceKind === "directors" || audienceKind === "role" || audienceKind === "person_type" || audienceKind === "site" || audienceKind === "department") {
      audienceKind = "company";
      audienceValues = m.companyId != null ? [m.companyId] : [];
    } else if (audienceKind === "company") {
      audienceValues = m.companyId != null ? [m.companyId] : [];
    } else if (audienceKind === "people") {
      const reports = new Set(await directReportIds(m.id));
      const { data } = await sb.from("people").select("id").eq("company_id", m.companyId ?? -1);
      const sameCompany = new Set((data ?? []).map((r) => r.id as number));
      audienceValues = audienceValues.filter((v) => typeof v === "number" && (reports.has(v) || sameCompany.has(v)));
    }
  }

  const pinned = fd.get("pinned") === "on" || fd.get("pinned") === "true";
  const requireAck = fd.get("requireAck") === "on" || fd.get("requireAck") === "true";
  const publishAt = parseDateLocal(fd.get("publishAt")?.toString() ?? null);
  const expiresAt = parseDateLocal(fd.get("expiresAt")?.toString() ?? null);

  return {
    ok: true,
    payload: {
      title,
      body,
      type,
      audience_kind: audienceKind,
      audience_values: audienceValues,
      pinned,
      require_ack: requireAck,
      publish_at: publishAt,
      expires_at: expiresAt,
      created_by: author.createdBy,
      author_person_id: author.authorPersonId,
    },
  };
}

/** Notify the resolved audience that a published announcement is live. */
async function notifyAudience(id: number) {
  const a = await getAnnouncement(id);
  if (!a) return;
  const ids = await resolveAudiencePersonIds(a);
  if (ids.length === 0) return;
  await notifyMany(
    ids.map((pid) => personRecipient(pid)),
    { kind: "announcement", title: `📣 ${a.title}`, body: a.body.slice(0, 160), actor: a.createdBy }
  );
}

/* --------------------------- admin (owner) --------------------------- */

export async function saveAnnouncementAction(fd: FormData): Promise<Result> {
  const idRaw = fd.get("id")?.toString();
  const id = idRaw ? Number(idRaw) : null;
  const built = await buildPayload(fd, { createdBy: "web-ui", authorPersonId: null, manager: null });
  if (!built.ok) return { ok: false, error: built.error };

  const action = fd.get("action")?.toString() ?? "draft"; // draft | publish
  const nowIso = new Date().toISOString();

  if (id) {
    const update: Record<string, unknown> = { ...built.payload };
    if (action === "publish") {
      update.status = "published";
      update.published_at = built.payload.publish_at ?? nowIso;
    }
    const { error } = await sb.from("announcements").update(update).eq("id", id);
    if (error) return { ok: false, error: error.message };
    if (action === "publish") await notifyAudience(id);
    revalidatePath("/announcements");
    return { ok: true, id };
  }

  const status = action === "publish" ? "published" : "draft";
  const { data, error } = await sb
    .from("announcements")
    .insert({
      ...built.payload,
      status,
      published_at: status === "published" ? (built.payload.publish_at ?? nowIso) : null,
      created_at: nowIso,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save." };
  const newId = data.id as number;
  if (status === "published") await notifyAudience(newId);
  revalidatePath("/announcements");
  return { ok: true, id: newId };
}

export async function publishAnnouncementAction(id: number): Promise<Result> {
  const a = await getAnnouncement(id);
  if (!a) return { ok: false, error: "Not found." };
  const { error } = await sb
    .from("announcements")
    .update({ status: "published", published_at: a.publishAt ?? new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await notifyAudience(id);
  revalidatePath("/announcements");
  return { ok: true, id };
}

export async function archiveAnnouncementAction(id: number): Promise<Result> {
  const { error } = await sb.from("announcements").update({ status: "archived" }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/announcements");
  return { ok: true, id };
}

export async function deleteAnnouncementAction(id: number): Promise<Result> {
  const { error } = await sb.from("announcements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/announcements");
  return { ok: true, id };
}

/* --------------------------- portal (director / manager) --------------------------- */

export async function portalCreateAnnouncement(fd: FormData): Promise<Result> {
  const me = await getPortalPerson();
  if (!me || (me.portalRole !== "director" && me.portalRole !== "manager")) {
    return { ok: false, error: "You don't have permission to post announcements." };
  }
  const createdBy = me.portalRole === "director" ? `portal-dir:${me.name}` : `portal-mgr:${me.name}`;
  const built = await buildPayload(fd, {
    createdBy,
    authorPersonId: me.id,
    manager: me.portalRole === "manager" ? me : null,
  });
  if (!built.ok) return { ok: false, error: built.error };

  // Portal authors publish straight away (no draft staging for them).
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("announcements")
    .insert({
      ...built.payload,
      status: "published",
      published_at: built.payload.publish_at ?? nowIso,
      created_at: nowIso,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not post." };
  const newId = data.id as number;
  await notifyAudience(newId);
  revalidatePath("/portal");
  revalidatePath("/portal/announcements");
  revalidatePath("/announcements");
  return { ok: true, id: newId };
}

/* --------------------------- receipts (both surfaces) --------------------------- */

export async function portalMarkSeenAction(id: number): Promise<{ ok: boolean }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false };
  await markSeenLib(id, personRecipient(me.id));
  return { ok: true };
}

export async function portalAcknowledgeAction(id: number): Promise<{ ok: boolean }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false };
  await acknowledgeLib(id, personRecipient(me.id));
  revalidatePath("/portal");
  revalidatePath("/portal/announcements");
  return { ok: true };
}

export async function adminMarkSeenAction(id: number): Promise<{ ok: boolean }> {
  await markSeenLib(id, "admin");
  return { ok: true };
}
