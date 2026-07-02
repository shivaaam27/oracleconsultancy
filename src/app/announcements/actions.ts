"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { getPortalPerson, directReportIds, isScopedDirector } from "@/lib/portal-auth";
import { personRecipient, notifyMany } from "@/lib/notifications";
import {
  getAnnouncement,
  resolveAudiencePersonIds,
  createDeliveryDrafts,
  markSeen as markSeenLib,
  acknowledge as acknowledgeLib,
  toggleReaction,
  listComments,
  addComment,
  type AudienceKind,
  type AnnouncementType,
} from "@/lib/announcements";
import { recipientForCreatedBy, createNotification } from "@/lib/notifications";
import type { AnnouncementComment } from "@/lib/announcements-shared";

import { callGroqJson, LOW_CONFIDENCE } from "@/lib/ai-json";
import { getGroqKey } from "@/lib/settings";

type Result = { ok: true; id: number } | { ok: false; error: string };

/** Author gate for AI helpers — owner, director or manager only. */
async function canAuthor(): Promise<boolean> {
  const me = await getPortalPerson();
  if (!me) return true; // admin (middleware-gated page); no portal cookie
  return me.portalRole === "director" || me.portalRole === "manager";
}

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

async function buildPayload(fd: FormData, author: { createdBy: string; authorPersonId: number | null; scope: { companyId: number | null; managerId: number | null } | null }): Promise<BuiltPayload> {
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

  // Scope guard: a MANAGER or a company-scoped DIRECTOR may only address their own
  // company — broad audiences (everyone / managers / directors / role / type / site /
  // department) collapse to "their company"; "specific people" is filtered to people
  // in that company (plus a manager's direct reports). A portfolio director / admin
  // (scope null) is unrestricted. This is the server-side guarantee — never trust the
  // composer to have limited the audience.
  if (author.scope) {
    const { companyId, managerId } = author.scope;
    if (audienceKind === "all" || audienceKind === "managers" || audienceKind === "directors" || audienceKind === "role" || audienceKind === "person_type" || audienceKind === "site" || audienceKind === "department") {
      audienceKind = "company";
      audienceValues = companyId != null ? [companyId] : [];
    } else if (audienceKind === "company") {
      audienceValues = companyId != null ? [companyId] : [];
    } else if (audienceKind === "people") {
      const allowed = new Set<number>();
      const { data } = await sb.from("people").select("id").eq("company_id", companyId ?? -1);
      for (const r of data ?? []) allowed.add(r.id as number);
      if (managerId != null) for (const id of await directReportIds(managerId)) allowed.add(id);
      audienceValues = audienceValues.filter((v) => typeof v === "number" && allowed.has(v));
    }
  }

  const pinned = fd.get("pinned") === "on" || fd.get("pinned") === "true";
  const requireAck = fd.get("requireAck") === "on" || fd.get("requireAck") === "true";
  const takeover = fd.get("takeover") === "on" || fd.get("takeover") === "true";
  const deliverChannels = fd
    .getAll("deliverChannels")
    .map((v) => v.toString().toLowerCase())
    .filter((c) => c === "email" || c === "whatsapp");
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
      takeover,
      deliver_channels: deliverChannels,
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
  // Mirror into each person's read-only "Announcements" chat thread. SILENT — the
  // notifyMany call above already pushed via the notification bell, so we don't
  // double-buzz; the message just lands in their Announcements thread.
  const { postSystemMessage } = await import("@/lib/chat");
  const chatBody = a.body?.trim() ? `${a.title}\n\n${a.body}` : a.title;
  for (const pid of ids) {
    try {
      await postSystemMessage({ personId: pid, kind: "announce", title: "Announcements", body: chatBody, silent: true });
    } catch { /* best-effort: one person's chat copy failing must not block publish */ }
  }
  // Extra channels (email / WhatsApp) land as Outbox drafts for the owner to send.
  await createDeliveryDrafts(a);
}

/* --------------------------- admin (owner) --------------------------- */

export async function saveAnnouncementAction(fd: FormData): Promise<Result> {
  const idRaw = fd.get("id")?.toString();
  const id = idRaw ? Number(idRaw) : null;
  const built = await buildPayload(fd, { createdBy: "web-ui", authorPersonId: null, scope: null });
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
    // Managers AND company-scoped directors are limited to their own company; a
    // portfolio director is unrestricted (scope null).
    scope:
      me.portalRole === "manager"
        ? { companyId: me.companyId, managerId: me.id }
        : isScopedDirector(me)
          // NOTE: the announcement audience is single-company; a multi-company
          // scoped director currently targets their FIRST company. (Extend the
          // audience model to post per company later.)
          ? { companyId: me.directorCompanyIds[0] ?? null, managerId: null }
          : null,
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

/* --------------------------- reactions & questions (A6) --------------------------- */

export async function portalToggleReactionAction(id: number, emoji: string): Promise<{ ok: boolean; on?: boolean }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false };
  const allowed = ["👍", "❤️", "🎉", "👏"];
  if (!allowed.includes(emoji)) return { ok: false };
  const on = await toggleReaction(id, me.id, emoji);
  return { ok: true, on };
}

export async function getCommentsAction(id: number): Promise<AnnouncementComment[]> {
  return listComments(id);
}

/** Staff post a question; managers/directors post an answer. Notifies the author. */
export async function portalAddCommentAction(id: number, body: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Not signed in." };
  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "Write something first." };
  const isAnswer = me.portalRole === "director" || me.portalRole === "manager";
  await addComment({ announcementId: id, personId: me.id, authorName: me.name, body: text, isAnswer });
  // Let the author know there's a question (best-effort).
  if (!isAnswer) {
    const a = await getAnnouncement(id);
    const recipient = a ? await recipientForCreatedBy(a.createdBy) : null;
    if (recipient) {
      await createNotification({
        recipient,
        kind: "announcement",
        title: `Question on "${a!.title}"`,
        body: `${me.name}: ${text.slice(0, 140)}`,
        actor: me.name,
      });
    }
  }
  revalidatePath("/portal/announcements");
  return { ok: true };
}

/** Owner answers a question from the admin noticeboard. */
export async function adminAddCommentAction(id: number, body: string): Promise<{ ok: boolean; error?: string }> {
  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "Write something first." };
  await addComment({ announcementId: id, personId: null, authorName: "Management", body: text, isAnswer: true });
  revalidatePath("/announcements");
  return { ok: true };
}

/* --------------------------- AI helpers (A5) --------------------------- */

type DraftResult = { ok: true; title: string; body: string } | { ok: false; error: string };

/** Turn a short instruction into a polished announcement (title + body). */
export async function draftAnnouncementAction(prompt: string): Promise<DraftResult> {
  if (!(await canAuthor())) return { ok: false, error: "Not allowed." };
  const clean = (prompt ?? "").trim();
  if (!clean) return { ok: false, error: "Tell me what the announcement is about." };
  const key = await getGroqKey();
  if (!key) return { ok: false, error: "AI is switched off. You can write it by hand." };

  const res = await callGroqJson({
    apiKey: key,
    maxTokens: 500,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You write internal staff announcements for a Tanzanian company group. British English. " +
          "Return JSON {title, body, confidence}. Title: under 70 characters, plain and clear. " +
          "Body: 1-3 short paragraphs, warm and professional, no markdown, no signature. " +
          "Do not invent dates, names or figures that are not in the instruction.",
      },
      { role: "user", content: clean },
    ],
    shape: { required: { title: "string", body: "string" } },
  });
  if (!res.ok || !res.data) return { ok: false, error: "Could not draft just now — please write it by hand." };
  if (res.confidence != null && res.confidence < LOW_CONFIDENCE) {
    // Still return it — the author reviews before publishing.
  }
  return { ok: true, title: String(res.data.title ?? ""), body: String(res.data.body ?? "") };
}

type TranslateResult = { ok: true; text: string } | { ok: false; error: string };

/** Translate the announcement text between English and Swahili. */
export async function translateAnnouncementAction(text: string, to: "sw" | "en"): Promise<TranslateResult> {
  if (!(await canAuthor())) return { ok: false, error: "Not allowed." };
  const clean = (text ?? "").trim();
  if (!clean) return { ok: false, error: "Nothing to translate yet." };
  const key = await getGroqKey();
  if (!key) return { ok: false, error: "AI is switched off." };

  const target = to === "sw" ? "Swahili (Kiswahili, as spoken in Tanzania)" : "English (British English)";
  const res = await callGroqJson({
    apiKey: key,
    maxTokens: 600,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          `Translate the user's internal staff announcement into ${target}. ` +
          "Keep the same meaning, tone and paragraph breaks. Do not add or remove information. " +
          "Return JSON {text}.",
      },
      { role: "user", content: clean },
    ],
    shape: { required: { text: "string" } },
  });
  if (!res.ok || !res.data) return { ok: false, error: "Could not translate just now." };
  return { ok: true, text: String(res.data.text ?? "") };
}
