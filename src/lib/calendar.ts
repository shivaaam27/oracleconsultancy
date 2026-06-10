// Calendar data layer — read/write helpers for the standalone calendar.
// Server-only (uses the service-role Supabase client). The .ics/Google-URL
// shaping lives in src/lib/ics.ts; this file owns persistence + mapping.

import { randomUUID } from "crypto";
import { sb } from "@/db/supabase";
import type { IcsAttendee, IcsEvent } from "@/lib/ics";

export type CalendarAttendee = {
  personId?: number;
  name: string;
  email?: string;
};

export type CalendarEvent = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  meetLink: string | null;
  companyId: number | null;
  startAt: string; // ISO
  endAt: string | null;
  allDay: boolean;
  reminderMinutes: number | null;
  attendees: CalendarAttendee[];
  source: string;
  meetingId: number | null;
  taskId: number | null;
  uid: string;
  sequence: number;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

function parseAttendees(raw: unknown): CalendarAttendee[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as CalendarAttendee[]) : [];
  } catch {
    return [];
  }
}

function mapRow(r: Row): CalendarEvent {
  return {
    id: r.id as number,
    title: r.title as string,
    description: (r.description as string) ?? null,
    location: (r.location as string) ?? null,
    meetLink: (r.meet_link as string) ?? null,
    companyId: (r.company_id as number) ?? null,
    startAt: r.start_at as string,
    endAt: (r.end_at as string) ?? null,
    allDay: !!r.all_day,
    reminderMinutes: (r.reminder_minutes as number) ?? null,
    attendees: parseAttendees(r.attendees),
    source: (r.source as string) ?? "manual",
    meetingId: (r.meeting_id as number) ?? null,
    taskId: (r.task_id as number) ?? null,
    uid: r.uid as string,
    sequence: (r.sequence as number) ?? 0,
    status: (r.status as string) ?? "confirmed",
    createdBy: (r.created_by as string) ?? "web-ui",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export type CalendarEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  meetLink?: string | null;
  companyId?: number | null;
  startAt: string | Date;
  endAt?: string | Date | null;
  allDay?: boolean;
  reminderMinutes?: number | null;
  attendees?: CalendarAttendee[];
  source?: string;
  meetingId?: number | null;
  taskId?: number | null;
  createdBy?: string;
};

function toIso(d: string | Date | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : d;
}

/** List events overlapping [from, to). Both ISO strings; `to` is exclusive. */
export async function listCalendarEvents(opts?: {
  from?: string;
  to?: string;
  companyId?: number;
}): Promise<CalendarEvent[]> {
  let q = sb.from("calendar_events").select("*").order("start_at", { ascending: true });
  if (opts?.from) q = q.gte("start_at", opts.from);
  if (opts?.to) q = q.lt("start_at", opts.to);
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function getCalendarEvent(id: number): Promise<CalendarEvent | null> {
  const { data, error } = await sb.from("calendar_events").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data) : null;
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEvent> {
  const now = new Date().toISOString();
  const uid = `${randomUUID()}@cos-system`;
  const payload = {
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    meet_link: input.meetLink ?? null,
    company_id: input.companyId ?? null,
    start_at: toIso(input.startAt),
    end_at: toIso(input.endAt),
    all_day: input.allDay ?? false,
    reminder_minutes: input.reminderMinutes ?? null,
    attendees: input.attendees ? JSON.stringify(input.attendees) : null,
    source: input.source ?? "manual",
    meeting_id: input.meetingId ?? null,
    task_id: input.taskId ?? null,
    uid,
    sequence: 0,
    status: "confirmed",
    created_by: input.createdBy ?? "web-ui",
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await sb.from("calendar_events").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

/** Patch an event; bumps `sequence` so re-sent .ics files update, not duplicate. */
export async function updateCalendarEvent(
  id: number,
  patch: Partial<CalendarEventInput>
): Promise<CalendarEvent> {
  const existing = await getCalendarEvent(id);
  if (!existing) throw new Error("Event not found");
  const payload: Row = { updated_at: new Date().toISOString(), sequence: existing.sequence + 1 };
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.location !== undefined) payload.location = patch.location;
  if (patch.meetLink !== undefined) payload.meet_link = patch.meetLink;
  if (patch.companyId !== undefined) payload.company_id = patch.companyId;
  if (patch.startAt !== undefined) payload.start_at = toIso(patch.startAt);
  if (patch.endAt !== undefined) payload.end_at = toIso(patch.endAt);
  if (patch.allDay !== undefined) payload.all_day = patch.allDay;
  if (patch.reminderMinutes !== undefined) payload.reminder_minutes = patch.reminderMinutes;
  if (patch.attendees !== undefined)
    payload.attendees = patch.attendees ? JSON.stringify(patch.attendees) : null;
  const { data, error } = await sb
    .from("calendar_events")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  const { error } = await sb.from("calendar_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Shape a stored event into the form the .ics/Google-URL builders expect. */
export function toIcsEvent(
  ev: CalendarEvent,
  organizer?: { name?: string | null; email?: string | null }
): IcsEvent {
  return {
    uid: ev.uid,
    title: ev.title,
    description: ev.description,
    location: ev.location,
    meetLink: ev.meetLink,
    start: new Date(ev.startAt),
    end: ev.endAt ? new Date(ev.endAt) : null,
    allDay: ev.allDay,
    reminderMinutes: ev.reminderMinutes,
    attendees: ev.attendees
      .filter((a): a is CalendarAttendee & { name: string } => !!a.name)
      .map<IcsAttendee>((a) => ({ name: a.name, email: a.email })),
    organizerName: organizer?.name ?? null,
    organizerEmail: organizer?.email ?? null,
    sequence: ev.sequence,
    status: ev.status === "cancelled" ? "cancelled" : "confirmed",
  };
}
