import "server-only";
import { sb } from "@/db/supabase";
import type { ToolDef } from "@/lib/ori/tools";
import { str, resolveEvent } from "@/lib/ori/tools";
import { escapeLike } from "@/lib/db-helpers";
import { canAutoSend } from "@/lib/guardrails";
import {
  deleteEventAction,
  skipEventOccurrence,
  restoreEventOccurrence,
  ensureEventMeetLink,
  sendEventInviteAction,
  draftEventRemindersAction,
  createEventCategory,
  renameEventCategory,
  mergeEventCategories,
  deleteEventCategory,
} from "@/app/calendar/actions";
import {
  saveAnnouncementAction,
  archiveAnnouncementAction,
  deleteAnnouncementAction,
  nudgeAnnouncementAction,
  translateAnnouncementAction,
} from "@/app/announcements/actions";

/* ------------------------------------------------------------------ *
 * Local resolvers (no shared resolver exists for these two).
 * ------------------------------------------------------------------ */

/** Resolve an event category by id or (fuzzy) name. */
async function resolveEventCategory(ref: string): Promise<{ id: number; name: string } | null> {
  const token = str(ref);
  if (!token) return null;
  if (/^\d+$/.test(token)) {
    const { data } = await sb.from("event_categories").select("id,name").eq("id", Number(token)).maybeSingle();
    return data ? { id: data.id as number, name: (data.name as string) ?? "" } : null;
  }
  const { data } = await sb
    .from("event_categories")
    .select("id,name")
    .ilike("name", `%${escapeLike(token)}%`)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as number, name: (data.name as string) ?? "" } : null;
}

/** Resolve a live announcement by id or (fuzzy) title; newest first. */
async function resolveAnnouncement(ref: string): Promise<{ id: number; title: string } | null> {
  const token = str(ref);
  if (!token) return null;
  if (/^\d+$/.test(token)) {
    const { data } = await sb.from("announcements").select("id,title").eq("id", Number(token)).maybeSingle();
    return data ? { id: data.id as number, title: (data.title as string) ?? "" } : null;
  }
  const { data } = await sb
    .from("announcements")
    .select("id,title")
    .ilike("title", `%${escapeLike(token)}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as number, title: (data.title as string) ?? "" } : null;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const CALENDAR_TOOLS: ToolDef[] = [
  /* ----------------------------- EVENTS ----------------------------- */
  {
    name: "delete_event",
    tier: 3,
    description:
      "Delete a calendar event permanently and remove any tasks it spawned. Guests who were invited are emailed a cancellation. To keep the record and just mark it off, use cancel_event instead.",
    params: {
      event: { type: "string", required: true, description: "The event — its id or title." },
    },
    async run(args) {
      const ev = await resolveEvent(str(args.event));
      if (!ev) return { ok: false, message: `Couldn't find an event matching "${str(args.event)}".` };
      const res = await deleteEventAction(ev.id);
      if (!res.ok) return { ok: false, message: res.error };
      // Hard-delete + guest cancellation emails already gone out — no clean inverse,
      // so no undo is offered (mirrors the framework's "omit undo when irreversible").
      return { ok: true, message: `Deleted "${ev.title}".`, redirect: `/calendar` };
    },
  },
  {
    name: "skip_event_occurrence",
    tier: 2,
    description: "Skip (cancel) ONE date of a recurring event, keeping the rest of the series.",
    params: {
      event: { type: "string", required: true, description: "The recurring event — its id or title." },
      date: { type: "date", required: true, description: "The single occurrence date to skip, YYYY-MM-DD." },
    },
    async run(args) {
      const ev = await resolveEvent(str(args.event));
      if (!ev) return { ok: false, message: `Couldn't find an event matching "${str(args.event)}".` };
      const dateKey = str(args.date).slice(0, 10);
      if (!DATE_KEY.test(dateKey)) return { ok: false, message: "Give the occurrence date as YYYY-MM-DD." };
      const res = await skipEventOccurrence(ev.id, dateKey);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Skipped "${ev.title}" on ${dateKey}.`,
        redirect: `/calendar`,
        undo: { kind: "ori.event.skip_occurrence", payload: { eventId: ev.id, dateKey } },
      };
    },
  },
  {
    name: "restore_event_occurrence",
    tier: 2,
    description: "Restore a previously-skipped single date of a recurring event.",
    params: {
      event: { type: "string", required: true, description: "The recurring event — its id or title." },
      date: { type: "date", required: true, description: "The skipped occurrence date to restore, YYYY-MM-DD." },
    },
    async run(args) {
      const ev = await resolveEvent(str(args.event));
      if (!ev) return { ok: false, message: `Couldn't find an event matching "${str(args.event)}".` };
      const dateKey = str(args.date).slice(0, 10);
      if (!DATE_KEY.test(dateKey)) return { ok: false, message: "Give the occurrence date as YYYY-MM-DD." };
      const res = await restoreEventOccurrence(ev.id, dateKey);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Restored "${ev.title}" on ${dateKey}.`,
        redirect: `/calendar`,
        undo: { kind: "ori.event.restore_occurrence", payload: { eventId: ev.id, dateKey } },
      };
    },
  },
  {
    name: "ensure_event_meet_link",
    tier: 2,
    description: "Make sure an event has a Google Meet video link, minting one if it doesn't already have it.",
    params: {
      event: { type: "string", required: true, description: "The event — its id or title." },
    },
    async run(args) {
      const ev = await resolveEvent(str(args.event));
      if (!ev) return { ok: false, message: `Couldn't find an event matching "${str(args.event)}".` };
      const res = await ensureEventMeetLink(ev.id);
      if (!res.meetLink) return { ok: false, message: `Couldn't get a Meet link for "${ev.title}" — Google Calendar may not be connected.` };
      // Minting a link has no meaningful inverse, so no undo is offered.
      return { ok: true, message: `Meet link ready for "${ev.title}": ${res.meetLink}`, redirect: `/calendar` };
    },
  },
  {
    name: "send_event_invite",
    tier: 3,
    description:
      "Email the branded Oracle invitation (with calendar attachment) to every attendee of an event who has an email address.",
    params: {
      event: { type: "string", required: true, description: "The event — its id or title." },
    },
    async run(args) {
      const ev = await resolveEvent(str(args.event));
      if (!ev) return { ok: false, message: `Couldn't find an event matching "${str(args.event)}".` };
      // Invitations go out by email; gate on the email guardrail before sending.
      if (!(await canAutoSend("email"))) {
        return {
          ok: false,
          message:
            "Blocked by guardrail: auto-send on email is switched off. Turn it on in Settings → Automation, or send the invite from the calendar yourself.",
        };
      }
      const res = await sendEventInviteAction(ev.id);
      if (!res.ok) return { ok: false, message: res.error };
      // A sent invitation has no clean inverse — no undo.
      return { ok: true, message: `Invited ${res.count} attendee${res.count === 1 ? "" : "s"} to "${ev.title}".`, redirect: `/calendar` };
    },
  },
  {
    name: "draft_event_reminders",
    tier: 2,
    description: "Prepare Outbox reminder drafts for an event's attendees (nothing is sent — the owner sends them from the Outbox).",
    params: {
      event: { type: "string", required: true, description: "The event — its id or title." },
    },
    async run(args) {
      const ev = await resolveEvent(str(args.event));
      if (!ev) return { ok: false, message: `Couldn't find an event matching "${str(args.event)}".` };
      const res = await draftEventRemindersAction(ev.id);
      if (!res.ok) return { ok: false, message: res.error };
      // Creates Outbox drafts only (no send) — low-risk, no undo offered.
      return { ok: true, message: `Drafted ${res.count} reminder${res.count === 1 ? "" : "s"} for "${ev.title}" in the Outbox.`, redirect: `/outbox` };
    },
  },

  /* ----------------------- EVENT CATEGORIES ------------------------- */
  {
    name: "create_event_category",
    tier: 2,
    description: "Add a new event category (e.g. Board, Site visit) to the calendar reference list.",
    params: {
      name: { type: "string", required: true, description: "The category name." },
    },
    async run(args) {
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the category a name." };
      const res = await createEventCategory(name);
      if (!res.ok) return { ok: false, message: res.error };
      const created = await resolveEventCategory(name);
      return {
        ok: true,
        message: `Added event category "${name}".`,
        redirect: `/calendar`,
        ...(created ? { undo: { kind: "ori.event_category.create", payload: { categoryId: created.id } } } : {}),
      };
    },
  },
  {
    name: "rename_event_category",
    tier: 2,
    description: "Rename an event category.",
    params: {
      category: { type: "string", required: true, description: "The category — its id or current name." },
      name: { type: "string", required: true, description: "The new name." },
    },
    async run(args) {
      const cat = await resolveEventCategory(str(args.category));
      if (!cat) return { ok: false, message: `Couldn't find a category matching "${str(args.category)}".` };
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the category a new name." };
      const res = await renameEventCategory(cat.id, name);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Renamed "${cat.name}" to "${name}".`,
        redirect: `/calendar`,
        undo: { kind: "ori.event_category.rename", payload: { categoryId: cat.id, before: cat.name } },
      };
    },
  },
  {
    name: "merge_event_categories",
    tier: 2,
    description: "Merge one event category into another: its events are re-pointed to the target, then the source category is removed.",
    params: {
      from: { type: "string", required: true, description: "The category to merge FROM (removed) — its id or name." },
      into: { type: "string", required: true, description: "The category to merge INTO (kept) — its id or name." },
    },
    async run(args) {
      const from = await resolveEventCategory(str(args.from));
      if (!from) return { ok: false, message: `Couldn't find a category matching "${str(args.from)}".` };
      const into = await resolveEventCategory(str(args.into));
      if (!into) return { ok: false, message: `Couldn't find a category matching "${str(args.into)}".` };
      if (from.id === into.id) return { ok: false, message: "Pick two different categories to merge." };
      const res = await mergeEventCategories(from.id, into.id);
      if (!res.ok) return { ok: false, message: res.error };
      // Merge re-points events and drops the source — no clean inverse, so no undo.
      return { ok: true, message: `Merged "${from.name}" into "${into.name}".`, redirect: `/calendar` };
    },
  },
  {
    name: "delete_event_category",
    tier: 3,
    description: "Delete an event category. Its events are not lost — they simply become uncategorised.",
    params: {
      category: { type: "string", required: true, description: "The category — its id or name." },
    },
    async run(args) {
      const cat = await resolveEventCategory(str(args.category));
      if (!cat) return { ok: false, message: `Couldn't find a category matching "${str(args.category)}".` };
      const res = await deleteEventCategory(cat.id);
      if (!res.ok) return { ok: false, message: res.error };
      // The events that referenced it are set to NULL (uncategorised) — re-creating the
      // category wouldn't restore those links, so there is no clean inverse; no undo.
      return { ok: true, message: `Deleted event category "${cat.name}". Its events are now uncategorised.`, redirect: `/calendar` };
    },
  },

  /* -------------------------- ANNOUNCEMENTS ------------------------- */
  {
    name: "save_announcement",
    tier: 2,
    description:
      "Create a DRAFT announcement (title + body). It is NOT published to staff — use publish_announcement / draft_announcement for the published feed.",
    params: {
      title: { type: "string", required: true, description: "The announcement title." },
      body: { type: "string", required: false, description: "The announcement body text." },
      type: {
        type: "string",
        required: false,
        description: "One of: policy, holiday, safety, celebration, operational, urgent. Defaults to operational.",
      },
    },
    async run(args) {
      const title = str(args.title);
      if (!title) return { ok: false, message: "Give the announcement a title." };
      const fd = new FormData();
      fd.set("title", title);
      fd.set("body", str(args.body));
      const type = str(args.type).toLowerCase();
      const VALID = ["policy", "holiday", "safety", "celebration", "operational", "urgent"];
      fd.set("type", VALID.includes(type) ? type : "operational");
      fd.set("audienceKind", "all");
      fd.set("action", "draft");
      const res = await saveAnnouncementAction(fd);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Saved draft announcement "${title}".`,
        redirect: `/announcements`,
        undo: { kind: "ori.announcement.delete", payload: { announcementId: res.id } },
      };
    },
  },
  {
    name: "archive_announcement",
    tier: 3,
    description: "Archive an announcement — it drops off the live feed but the record is kept.",
    params: {
      announcement: { type: "string", required: true, description: "The announcement — its id or title." },
    },
    async run(args) {
      const a = await resolveAnnouncement(str(args.announcement));
      if (!a) return { ok: false, message: `Couldn't find an announcement matching "${str(args.announcement)}".` };
      // Snapshot the status BEFORE archiving so undo can put it back.
      const { data: before } = await sb.from("announcements").select("status").eq("id", a.id).maybeSingle();
      const res = await archiveAnnouncementAction(a.id);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Archived "${a.title}".`,
        redirect: `/announcements`,
        undo: { kind: "ori.announcement.archive", payload: { announcementId: a.id, before: (before?.status as string) ?? "draft" } },
      };
    },
  },
  {
    name: "delete_announcement",
    tier: 3,
    description: "Delete an announcement. Prefer archive_announcement — this removes the record. Reversible via undo.",
    params: {
      announcement: { type: "string", required: true, description: "The announcement — its id or title." },
    },
    async run(args) {
      const a = await resolveAnnouncement(str(args.announcement));
      if (!a) return { ok: false, message: `Couldn't find an announcement matching "${str(args.announcement)}".` };
      // deleteAnnouncementAction hard-deletes the row; snapshot the FULL row first so
      // undo can re-insert it (AUTO_HARD_DELETE_FORBIDDEN — the step must be reversible).
      const { data: before } = await sb.from("announcements").select("*").eq("id", a.id).maybeSingle();
      if (!before) return { ok: false, message: `Couldn't read "${a.title}" before deleting.` };
      const res = await deleteAnnouncementAction(a.id);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Deleted "${a.title}".`,
        redirect: `/announcements`,
        undo: { kind: "ori.announcement.delete", payload: { announcementId: a.id, row: before } },
      };
    },
  },
  {
    name: "nudge_announcement",
    tier: 3,
    description: "Re-notify the people who haven't yet seen or acknowledged a live announcement.",
    params: {
      announcement: { type: "string", required: true, description: "The published announcement — its id or title." },
    },
    async run(args) {
      const a = await resolveAnnouncement(str(args.announcement));
      if (!a) return { ok: false, message: `Couldn't find an announcement matching "${str(args.announcement)}".` };
      // The nudge fires in-app notifications only (no email/WhatsApp/SMS), so the
      // channel-based canAutoSend guardrail doesn't apply — it stays Tier-3 because it
      // is an outward, non-undoable blast to many people.
      const res = await nudgeAnnouncementAction(a.id);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't nudge just now." };
      if (!res.nudged) return { ok: true, message: `Everyone has already seen "${a.title}" — no one to nudge.` };
      return { ok: true, message: `Nudged ${res.nudged} ${res.nudged === 1 ? "person" : "people"} about "${a.title}".` };
    },
  },
  {
    name: "translate_announcement",
    tier: 1,
    description: "Translate announcement text between English and Swahili (returns the translation — nothing is saved).",
    params: {
      text: { type: "string", required: true, description: "The text to translate." },
      to: { type: "string", required: true, description: 'Target language: "sw" (Swahili) or "en" (English).' },
    },
    async run(args) {
      const text = str(args.text);
      if (!text) return { ok: false, message: "Give me some text to translate." };
      const to = str(args.to).toLowerCase() === "en" ? "en" : "sw";
      const res = await translateAnnouncementAction(text, to as "sw" | "en");
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: res.text };
    },
  },
];
