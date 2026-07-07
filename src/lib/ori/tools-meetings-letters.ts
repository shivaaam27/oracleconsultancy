import "server-only";
import { sb } from "@/db/supabase";
import type { ToolDef } from "@/lib/ori/tools";
import { str, formHas } from "@/lib/ori/tools";
import { escapeLike } from "@/lib/db-helpers";

import {
  deleteMeeting,
  generateMeetingMinutes,
  generateMeetingInsight,
  parseMeetingNotes,
  type MeetingInsightKind,
} from "@/app/meeting/actions";
import { createNote, updateNote, deleteNote, setNotePinned } from "@/app/notes/actions";
import {
  createLetterAction,
  saveLetterDraftAction,
  issueLetterAction,
  duplicateLetterAction,
  deleteLetterAction,
  letterOutboxDraftAction,
} from "@/app/letters/actions";

// ---------- local resolvers (no shared resolveMeeting/Note/Letter exists) ----------

type MeetingRow = {
  id: number;
  title: string;
  company_id: number | null;
  attendees: string | null;
  raw_notes: string | null;
  minutes: string | null;
};

/** Resolve a meeting (kind="meeting") by numeric id or fuzzy title. Most recent wins. */
async function resolveMeeting(ref: string): Promise<MeetingRow | null> {
  const token = str(ref);
  if (!token) return null;
  const cols = "id,title,company_id,attendees,raw_notes,minutes";
  if (/^\d+$/.test(token)) {
    const { data } = await sb.from("meetings").select(cols).eq("id", Number(token)).eq("kind", "meeting").maybeSingle();
    return (data as MeetingRow | null) ?? null;
  }
  const { data } = await sb
    .from("meetings")
    .select(cols)
    .eq("kind", "meeting")
    .ilike("title", `%${escapeLike(token)}%`)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MeetingRow | null) ?? null;
}

type NoteRow = { id: number; title: string; raw_notes: string | null; company_id: number | null; pinned_at: string | null };

/** Resolve a note (kind="note") by numeric id or fuzzy title. Most recent wins. */
async function resolveNote(ref: string): Promise<NoteRow | null> {
  const token = str(ref);
  if (!token) return null;
  const cols = "id,title,raw_notes,company_id,pinned_at";
  if (/^\d+$/.test(token)) {
    const { data } = await sb.from("meetings").select(cols).eq("id", Number(token)).eq("kind", "note").maybeSingle();
    return (data as NoteRow | null) ?? null;
  }
  const { data } = await sb
    .from("meetings")
    .select(cols)
    .eq("kind", "note")
    .ilike("title", `%${escapeLike(token)}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as NoteRow | null) ?? null;
}

type LetterRow = { id: number; title: string | null; subject: string | null; type: string; status: string };

/** Resolve a letter by numeric id, or fuzzy title/subject. Most recent wins. */
async function resolveLetter(ref: string): Promise<LetterRow | null> {
  const token = str(ref);
  if (!token) return null;
  const cols = "id,title,subject,type,status";
  if (/^\d+$/.test(token)) {
    const { data } = await sb.from("letters").select(cols).eq("id", Number(token)).maybeSingle();
    return (data as LetterRow | null) ?? null;
  }
  const like = `%${escapeLike(token)}%`;
  const { data } = await sb
    .from("letters")
    .select(cols)
    .or(`title.ilike.${like},subject.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LetterRow | null) ?? null;
}

// ---------- tools ----------

export const MEETING_LETTER_TOOLS: ToolDef[] = [
  // ============================ MEETINGS ============================
  {
    name: "delete_meeting",
    tier: 3,
    description: "Delete a saved meeting and its notes/minutes.",
    params: {
      meeting: { type: "string", required: true, description: "The meeting — its id or title." },
    },
    async run(args) {
      const m = await resolveMeeting(str(args.meeting));
      if (!m) return { ok: false, message: `Couldn't find a meeting matching "${str(args.meeting)}".` };
      // Snapshot the full row BEFORE the hard-delete so the undo handler can re-insert it.
      const { data: full } = await sb.from("meetings").select("*").eq("id", m.id).maybeSingle();
      await deleteMeeting(m.id);
      return {
        ok: true,
        message: `Deleted the meeting "${m.title}".`,
        redirect: "/workbook",
        // deleteMeeting is a HARD delete; the undo re-inserts the captured row.
        undo: { kind: "ori.meeting.restore", payload: { row: full ?? null } },
      };
    },
  },
  {
    name: "generate_meeting_minutes",
    tier: 2,
    description: "Generate British-English minutes for a saved meeting from its raw notes, and save them onto the meeting.",
    params: {
      meeting: { type: "string", required: true, description: "The meeting — its id or title." },
    },
    async run(args) {
      const m = await resolveMeeting(str(args.meeting));
      if (!m) return { ok: false, message: `Couldn't find a meeting matching "${str(args.meeting)}".` };
      if (!(m.raw_notes ?? "").trim()) return { ok: false, message: `"${m.title}" has no notes to draw minutes from.` };
      let companyName: string | null = null;
      if (m.company_id) {
        const { data: c } = await sb.from("companies").select("name").eq("id", m.company_id).maybeSingle();
        companyName = (c?.name as string | null) ?? null;
      }
      const res = await generateMeetingMinutes({
        title: m.title,
        companyName,
        attendees: m.attendees,
        rawNotes: m.raw_notes ?? "",
      });
      if (res.source === "error") return { ok: false, message: res.message || "Couldn't generate minutes." };
      if (!res.minutes.trim()) return { ok: false, message: res.message || "Nothing to summarise." };
      // Persist onto the meeting via the notes updater (both live in the meetings table).
      const { error } = await sb.from("meetings").update({ minutes: res.minutes, updated_at: new Date().toISOString() }).eq("id", m.id);
      if (error) return { ok: false, message: `Generated minutes but couldn't save them: ${error.message}` };
      const note = res.source === "no-key" ? " (AI is off — used a rules draft.)" : res.source === "rules" ? " (rules draft.)" : "";
      return { ok: true, message: `Saved minutes for "${m.title}".${note}`, redirect: "/workbook" };
    },
  },
  {
    name: "generate_meeting_insight",
    tier: 2,
    description: "Extract decisions, risks & blockers, or a follow-up draft from a saved meeting's notes/minutes (read-only — returns text, saves nothing).",
    params: {
      meeting: { type: "string", required: true, description: "The meeting — its id or title." },
      kind: { type: "string", required: true, description: 'What to extract: "decisions", "risks", or "follow-up".' },
    },
    async run(args) {
      const m = await resolveMeeting(str(args.meeting));
      if (!m) return { ok: false, message: `Couldn't find a meeting matching "${str(args.meeting)}".` };
      const raw = str(args.kind).toLowerCase();
      const kind: MeetingInsightKind | null =
        raw.startsWith("decis") ? "decisions" : raw.startsWith("risk") ? "risks" : raw.includes("follow") ? "follow-up" : null;
      if (!kind) return { ok: false, message: 'Choose what to extract: "decisions", "risks", or "follow-up".' };
      let companyName: string | null = null;
      if (m.company_id) {
        const { data: c } = await sb.from("companies").select("name").eq("id", m.company_id).maybeSingle();
        companyName = (c?.name as string | null) ?? null;
      }
      const res = await generateMeetingInsight({
        kind,
        title: m.title,
        companyName,
        attendees: m.attendees,
        rawNotes: m.raw_notes ?? "",
        minutes: m.minutes,
      });
      if (res.source === "error") return { ok: false, message: res.message || "Couldn't extract that." };
      if (!res.text.trim()) return { ok: false, message: res.message || "Nothing clear was detected." };
      return { ok: true, message: res.text, redirect: "/workbook" };
    },
  },
  {
    name: "parse_meeting_notes",
    tier: 2,
    description: "Read free-text meeting notes and return the action items it can extract as candidate tasks (read-only — extracts, does not create). Use meeting_to_tasks to actually create them.",
    params: {
      notes: { type: "string", required: true, description: "The raw meeting notes to parse." },
      company: { type: "string", required: false, description: "Optional default company (id or name) for items without an obvious owner." },
    },
    async run(args) {
      const notes = str(args.notes);
      if (!notes.trim()) return { ok: false, message: "Give me the notes to parse." };
      let defaultCompanyId: number | undefined;
      if (formHas(args, "company")) {
        const token = str(args.company);
        if (/^\d+$/.test(token)) defaultCompanyId = Number(token);
        else {
          const { data: c } = await sb.from("companies").select("id").ilike("name", `%${escapeLike(token)}%`).limit(1).maybeSingle();
          if (c) defaultCompanyId = c.id as number;
        }
      }
      const res = await parseMeetingNotes(notes, defaultCompanyId);
      if (!res.tasks.length) return { ok: true, message: "No action items detected in those notes." };
      const lines = res.tasks
        .slice(0, 20)
        .map((t, i) => `${i + 1}. ${t.actionItem}${t.assigneeNames?.length ? ` — ${t.assigneeNames.join(", ")}` : ""}`)
        .join("\n");
      return { ok: true, message: `Found ${res.tasks.length} action item(s):\n${lines}\n\nUse meeting_to_tasks to create them.` };
    },
  },

  // ============================ NOTES ============================
  {
    name: "create_note",
    tier: 2,
    description: "Create a workbook note.",
    params: {
      title: { type: "string", required: false, description: "The note title." },
      body: { type: "string", required: false, description: "The note body." },
      company: { type: "string", required: false, description: "Optional company (id or name) to file the note under." },
    },
    async run(args) {
      if (!str(args.title) && !str(args.body)) return { ok: false, message: "Give the note a title or some content." };
      let companyId: number | null = null;
      if (formHas(args, "company")) {
        const token = str(args.company);
        if (/^\d+$/.test(token)) companyId = Number(token);
        else {
          const { data: c } = await sb.from("companies").select("id").ilike("name", `%${escapeLike(token)}%`).limit(1).maybeSingle();
          companyId = c ? (c.id as number) : null;
        }
      }
      const note = await createNote({ title: str(args.title) || undefined, body: str(args.body) || undefined, companyId });
      // The created row is undoable by trashing it — but there is no soft-delete for notes,
      // so we emit an ori.note.delete undo that removes the freshly-created note.
      return {
        ok: true,
        message: `Created note "${note.title}".`,
        redirect: "/workbook",
        undo: { kind: "ori.note.delete", payload: { noteId: note.id } },
      };
    },
  },
  {
    name: "update_note",
    tier: 2,
    description: "Edit a workbook note's title, body, company, or folder.",
    params: {
      note: { type: "string", required: true, description: "The note — its id or current title." },
      title: { type: "string", required: false, description: "New title." },
      body: { type: "string", required: false, description: "New body." },
      company: { type: "string", required: false, description: "New company (id or name); pass \"none\" to clear." },
      folder: { type: "string", required: false, description: "New folder; pass \"none\" to clear." },
    },
    async run(args) {
      const n = await resolveNote(str(args.note));
      if (!n) return { ok: false, message: `Couldn't find a note matching "${str(args.note)}".` };
      const patch: { id: number; title?: string; body?: string; companyId?: number | null; folder?: string | null } = { id: n.id };
      if (formHas(args, "title")) patch.title = str(args.title);
      if (formHas(args, "body")) patch.body = str(args.body);
      if (formHas(args, "folder")) {
        const f = str(args.folder);
        patch.folder = f && f.toLowerCase() !== "none" ? f : null;
      }
      // Snapshot BEFORE the write so the undo can restore prior title/body/company/folder.
      const { data: before } = await sb.from("meetings").select("title,raw_notes,company_id,folder").eq("id", n.id).maybeSingle();
      if (formHas(args, "company")) {
        const token = str(args.company);
        if (!token || token.toLowerCase() === "none") patch.companyId = null;
        else if (/^\d+$/.test(token)) patch.companyId = Number(token);
        else {
          const { data: c } = await sb.from("companies").select("id").ilike("name", `%${escapeLike(token)}%`).limit(1).maybeSingle();
          patch.companyId = c ? (c.id as number) : null;
        }
      }
      const res = await updateNote(patch);
      if (!res.ok) return { ok: false, message: "Couldn't save the note." };
      return {
        ok: true,
        message: `Updated note "${patch.title ?? n.title}".`,
        redirect: "/workbook",
        undo: {
          kind: "ori.note.update",
          payload: {
            noteId: n.id,
            before: {
              title: (before?.title as string | undefined) ?? n.title,
              body: (before?.raw_notes as string | undefined) ?? (n.raw_notes ?? ""),
              companyId: (before?.company_id as number | null | undefined) ?? n.company_id,
              folder: (before?.folder as string | null | undefined) ?? null,
            },
          },
        },
      };
    },
  },
  {
    name: "delete_note",
    tier: 3,
    description: "Delete a workbook note.",
    params: {
      note: { type: "string", required: true, description: "The note — its id or title." },
    },
    async run(args) {
      const n = await resolveNote(str(args.note));
      if (!n) return { ok: false, message: `Couldn't find a note matching "${str(args.note)}".` };
      // Snapshot the full row BEFORE the hard-delete so the undo can re-insert it.
      const { data: full } = await sb.from("meetings").select("*").eq("id", n.id).eq("kind", "note").maybeSingle();
      await deleteNote(n.id);
      return {
        ok: true,
        message: `Deleted note "${n.title}".`,
        redirect: "/workbook",
        undo: { kind: "ori.note.restore", payload: { row: full ?? null } },
      };
    },
  },
  {
    name: "set_note_pinned",
    tier: 2,
    description: "Pin or unpin a workbook note (pinned notes sort to the top).",
    params: {
      note: { type: "string", required: true, description: "The note — its id or title." },
      pinned: { type: "string", required: true, description: '"true" to pin, "false" to unpin.' },
    },
    async run(args) {
      const n = await resolveNote(str(args.note));
      if (!n) return { ok: false, message: `Couldn't find a note matching "${str(args.note)}".` };
      const raw = str(args.pinned).toLowerCase();
      const pinned = raw === "true" || raw === "1" || raw === "yes" || raw === "pin";
      const wasPinned = Boolean(n.pinned_at);
      await setNotePinned(n.id, pinned);
      return {
        ok: true,
        message: `${pinned ? "Pinned" : "Unpinned"} note "${n.title}".`,
        redirect: "/workbook",
        undo: { kind: "ori.note.pin", payload: { noteId: n.id, before: wasPinned } },
      };
    },
  },

  // ============================ LETTERS ============================
  {
    name: "create_letter",
    tier: 2,
    description: "Start a new draft letter of a given type for a company (and optional recipient person).",
    params: {
      type: { type: "string", required: true, description: 'Letter type, e.g. "invitation".' },
      company: { type: "string", required: false, description: "The company (id or name) whose letterhead to use." },
      person: { type: "string", required: false, description: "Optional recipient person (id or name)." },
    },
    async run(args) {
      const type = str(args.type).toLowerCase() || "invitation";
      let companyId: number | null = null;
      if (formHas(args, "company")) {
        const token = str(args.company);
        if (/^\d+$/.test(token)) companyId = Number(token);
        else {
          const { data: c } = await sb.from("companies").select("id").ilike("name", `%${escapeLike(token)}%`).limit(1).maybeSingle();
          companyId = c ? (c.id as number) : null;
        }
      }
      let personId: number | null = null;
      if (formHas(args, "person")) {
        const token = str(args.person);
        if (/^\d+$/.test(token)) personId = Number(token);
        else {
          const { data: p } = await sb.from("people").select("id").ilike("name", `%${escapeLike(token)}%`).limit(1).maybeSingle();
          personId = p ? (p.id as number) : null;
        }
      }
      const res = await createLetterAction(type, companyId, personId);
      if (!res.ok) return { ok: false, message: res.error };
      // A freshly-created draft can be cleanly deleted (hard-delete allowed for drafts).
      return {
        ok: true,
        message: `Created a ${type} draft letter.`,
        redirect: res.id ? `/letters/${res.id}` : "/letters",
        undo: res.id ? { kind: "ori.letter.delete", payload: { letterId: res.id } } : undefined,
      };
    },
  },
  {
    name: "save_letter_draft",
    tier: 2,
    description: "Save edits to a draft letter (addressee, subject, body, ref, date, title, company).",
    params: {
      letter: { type: "string", required: true, description: "The letter — its id, title, or subject." },
      addressee: { type: "string", required: false, description: "New addressee." },
      subject: { type: "string", required: false, description: "New subject." },
      body: { type: "string", required: false, description: "New body." },
      title: { type: "string", required: false, description: "New internal title." },
      company: { type: "string", required: false, description: "New company (id or name)." },
    },
    async run(args) {
      const l = await resolveLetter(str(args.letter));
      if (!l) return { ok: false, message: `Couldn't find a letter matching "${str(args.letter)}".` };
      if (l.status === "Issued") return { ok: false, message: `"${l.title ?? l.subject ?? "That letter"}" is already issued and can't be edited.` };
      const fields: { companyId?: number | null; addressee?: string; subject?: string; body?: string; title?: string } = {};
      if (formHas(args, "addressee")) fields.addressee = str(args.addressee);
      if (formHas(args, "subject")) fields.subject = str(args.subject);
      if (formHas(args, "body")) fields.body = str(args.body);
      if (formHas(args, "title")) fields.title = str(args.title);
      if (formHas(args, "company")) {
        const token = str(args.company);
        if (/^\d+$/.test(token)) fields.companyId = Number(token);
        else {
          const { data: c } = await sb.from("companies").select("id").ilike("name", `%${escapeLike(token)}%`).limit(1).maybeSingle();
          fields.companyId = c ? (c.id as number) : null;
        }
      }
      if (!Object.keys(fields).length) return { ok: false, message: "Nothing to save — give me a field to change." };
      // Snapshot BEFORE the write so the undo can restore the prior draft fields.
      const { data: before } = await sb.from("letters").select("title,subject,body,addressee,company_id").eq("id", l.id).maybeSingle();
      const res = await saveLetterDraftAction(l.id, fields);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Saved the letter draft.`,
        redirect: `/letters/${l.id}`,
        undo: { kind: "ori.letter.save", payload: { letterId: l.id, before: before ?? null } },
      };
    },
  },
  {
    name: "issue_letter",
    tier: 3,
    description: "Issue a draft letter — this freezes its letterhead snapshot and stamps a permanent reference. Irreversible.",
    params: {
      letter: { type: "string", required: true, description: "The letter — its id, title, or subject." },
    },
    async run(args) {
      const l = await resolveLetter(str(args.letter));
      if (!l) return { ok: false, message: `Couldn't find a letter matching "${str(args.letter)}".` };
      if (l.status === "Issued") return { ok: false, message: `"${l.title ?? l.subject ?? "That letter"}" is already issued.` };
      const res = await issueLetterAction(l.id);
      if (!res.ok) return { ok: false, message: res.error };
      // Issuing freezes a snapshot + stamps a ref — there is no clean inverse, so no undo.
      return { ok: true, message: `Issued the letter. Its reference is now stamped and the letterhead is frozen.`, redirect: `/letters/${l.id}` };
    },
  },
  {
    name: "duplicate_letter",
    tier: 2,
    description: "Duplicate a letter into a new draft.",
    params: {
      letter: { type: "string", required: true, description: "The letter to copy — its id, title, or subject." },
    },
    async run(args) {
      const l = await resolveLetter(str(args.letter));
      if (!l) return { ok: false, message: `Couldn't find a letter matching "${str(args.letter)}".` };
      const res = await duplicateLetterAction(l.id);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Duplicated the letter into a new draft.`,
        redirect: res.id ? `/letters/${res.id}` : "/letters",
        undo: res.id ? { kind: "ori.letter.delete", payload: { letterId: res.id } } : undefined,
      };
    },
  },
  {
    name: "delete_letter",
    tier: 3,
    description: "Delete a draft letter. Issued letters are permanent and cannot be deleted.",
    params: {
      letter: { type: "string", required: true, description: "The letter — its id, title, or subject." },
    },
    async run(args) {
      const l = await resolveLetter(str(args.letter));
      if (!l) return { ok: false, message: `Couldn't find a letter matching "${str(args.letter)}".` };
      if (l.status === "Issued") return { ok: false, message: `"${l.title ?? l.subject ?? "That letter"}" is issued and can't be deleted.` };
      // Snapshot the full draft row BEFORE the hard-delete so the undo can re-insert it.
      const { data: full } = await sb.from("letters").select("*").eq("id", l.id).maybeSingle();
      const res = await deleteLetterAction(l.id);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Deleted the draft letter.`,
        redirect: "/letters",
        undo: { kind: "ori.letter.restore", payload: { row: full ?? null } },
      };
    },
  },
  {
    name: "letter_outbox_draft",
    tier: 2,
    description: "Create an Outbox email draft for a letter, to review and send manually (does not send).",
    params: {
      letter: { type: "string", required: true, description: "The letter — its id, title, or subject." },
    },
    async run(args) {
      const l = await resolveLetter(str(args.letter));
      if (!l) return { ok: false, message: `Couldn't find a letter matching "${str(args.letter)}".` };
      const res = await letterOutboxDraftAction(l.id);
      if (!res.ok) return { ok: false, message: res.error };
      // Creates a Draft in the Outbox — it does NOT transmit, so no send-guardrail is needed here.
      return { ok: true, message: `Added an Outbox draft for the letter — open the Outbox to review and send it.`, redirect: "/outbox" };
    },
  },
];
