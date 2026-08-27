import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import {
  commentBlockers, darDay,
  type CzEvent, type CzEventKind, type CzSubjectType,
} from "@/lib/cocozuri-events-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri Stage E — what happened, when, and who did it. SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ RECORDING AN EVENT MUST NEVER FAIL THE THING IT DESCRIBES. If the timeline
 * write fails, the invoice still issued and the batch still closed — and saying
 * otherwise would make a note about history more important than the history. So
 * `recordEvent` swallows its own errors and reports them to the console, the
 * same stance `reindexEntity` takes.
 *
 * ⚠️ APPEND-ONLY. There is no update path and no delete path here, and there
 * must not be. A record of what happened that can be quietly rewritten is not a
 * record of anything.
 * ------------------------------------------------------------------ */

const EVENT_COLS = "id,subject_type,subject_id,subject_ref,kind,summary,detail,created_by,created_at";

function toEvent(r: Record<string, unknown>): CzEvent {
  return {
    id: r.id as number,
    subjectType: (r.subject_type as CzSubjectType) ?? "module",
    subjectId: (r.subject_id as number | null) ?? null,
    subjectRef: (r.subject_ref as string | null) ?? null,
    kind: (r.kind as CzEventKind) ?? "updated",
    summary: (r.summary as string) ?? "",
    detail: (r.detail as Record<string, unknown> | null) ?? null,
    by: (r.created_by as string) ?? "web-ui",
    at: r.created_at as string,
  };
}

/* ------------------------------- writing ------------------------------- */

export type EventInput = {
  subjectType: CzSubjectType;
  subjectId?: number | null;
  /** ⚠️ Frozen on the event — it must still read after the record is deleted. */
  subjectRef?: string | null;
  kind: CzEventKind;
  summary: string;
  detail?: Record<string, unknown> | null;
};

/**
 * **Write down that something happened.**
 *
 * ⚠️ IT NEVER THROWS AND NEVER RETURNS A FAILURE THE CALLER MUST HANDLE. A door
 * that had to check whether its own timeline entry landed would eventually start
 * refusing real work because a note could not be written.
 */
export async function recordEvent(input: EventInput, by = "web-ui"): Promise<void> {
  try {
    const company = await cocozuriCompany();
    if (!company) return;
    const { error } = await sb.from("cz_events").insert({
      company_id: company.id,
      subject_type: input.subjectType,
      subject_id: input.subjectId ?? null,
      subject_ref: input.subjectRef ?? null,
      kind: input.kind,
      summary: input.summary,
      detail: input.detail ?? null,
      created_by: by,
    });
    if (error) console.error("[cocozuri] recordEvent failed:", error.message);
  } catch (e) {
    console.error("[cocozuri] recordEvent threw:", e instanceof Error ? e.message : e);
  }
}

/**
 * Add a note to a record.
 *
 * ⚠️ A NOTE IS AN EVENT, in the same stream and the same order as everything
 * else. And like everything else it cannot be edited or deleted afterwards —
 * which is why it is refused when it says nothing.
 */
export async function addComment(
  subjectType: CzSubjectType,
  subjectId: number | null,
  subjectRef: string | null,
  body: string,
  by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const blockers = commentBlockers(body);
  if (blockers.length) return { ok: false, error: blockers[0] };

  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const { error } = await sb.from("cz_events").insert({
    company_id: company.id,
    subject_type: subjectType,
    subject_id: subjectId,
    subject_ref: subjectRef,
    kind: "comment",
    summary: body.trim(),
    created_by: by,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ------------------------------- reading ------------------------------- */

/** One record's timeline, oldest first — a story reads forwards. */
export async function timelineFor(
  subjectType: CzSubjectType, subjectId: number,
): Promise<CzEvent[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  const { data, error } = await sb.from("cz_events").select(EVENT_COLS)
    .eq("company_id", company.id)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at")
    .order("id");
  // ⚠️ Said out loud — an empty timeline and a failed query look identical.
  if (error) {
    console.error("[cocozuri] timelineFor failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toEvent);
}

/**
 * What happened across the module, newest first.
 *
 * ⚠️ THE DAY BOUNDS ARE DAR ES SALAAM'S, NOT UTC. Everything is stamped
 * `timestamptz`; asking for a plain date range would put everything before 3am
 * under the wrong day — the same trap `todayInDar` exists for.
 */
export async function dayLog(opts?: {
  from?: string; to?: string; subjectType?: CzSubjectType; limit?: number;
}): Promise<CzEvent[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_events").select(EVENT_COLS).eq("company_id", company.id);
  if (opts?.from) q = q.gte("created_at", `${opts.from}T00:00:00+03:00`);
  // ⚠️ The END of the day, or "to = today" returns nothing that happened today.
  if (opts?.to) q = q.lte("created_at", `${opts.to}T23:59:59.999+03:00`);
  if (opts?.subjectType) q = q.eq("subject_type", opts.subjectType);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts?.limit ?? 400);
  if (error) {
    console.error("[cocozuri] dayLog failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toEvent);
}

/** How many things happened on each of the last N days, for a glance. */
export async function recentActivity(days = 14): Promise<{ day: string; count: number }[]> {
  const events = await dayLog({ limit: 2000 });
  const tally = new Map<string, number>();
  for (const e of events) {
    const day = darDay(e.at);
    tally.set(day, (tally.get(day) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, days);
}
