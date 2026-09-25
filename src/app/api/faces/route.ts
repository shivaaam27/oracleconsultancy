import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getViewer } from "@/lib/viewer";
import { getPortalPerson, colleagueCompanyScope } from "@/lib/portal-auth";
import { viewerPeopleIds } from "@/lib/viewer-scope";
import { getAllTasks } from "@/lib/queries";
import { faceKey, moodFor, type FaceMood, type FaceRole, type FaceStats } from "@/lib/face-mood";

export const dynamic = "force-dynamic";

/**
 * Everyone's face: their role and how their work looks right now (the Blobatar
 * avatars, Sept 2026). Keyed by name as it appears on a task. Read once by the
 * page in the background (components/studio/face.tsx), so no page ever waits
 * on it; a face with no entry is simply calm.
 *
 * Signed-in only (owner, director, or a portal person — staff see their own
 * companies' people). A company-scoped director gets the faces
 * of their companies' people only — a mood says something about someone's work.
 */
type Entry = { id: number; key: string; face: [FaceRole, FaceMood] };

/**
 * Worked out at most once every five minutes per server, for everyone, and
 * filtered per viewer after. A mood does not need to be fresher than that, and
 * it keeps this route off the database's bill (egress): without it every page
 * load in every browser re-read the whole task list to draw the faces.
 */
const TTL_MS = 5 * 60_000;
let memo: { at: number; p: Promise<Entry[]> } | null = null;
function allFaces(): Promise<Entry[]> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.p;
  const p = computeFaces();
  memo = { at: Date.now(), p };
  p.catch(() => { if (memo?.p === p) memo = null; });
  return p;
}

export async function GET() {
  const v = await getViewer();
  let allowedFor: Promise<Set<number> | null>;
  if (v) allowedFor = viewerPeopleIds(v);
  else {
    // A member of staff (26 Sept 2026, owner: "do the faces"): the faces of the
    // people in their own companies — the same rule a director gets over theirs.
    const me = await getPortalPerson();
    if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    allowedFor = colleagueCompanyScope(me).then(async (scope) => {
      if (scope == null) return null;
      const [{ data: main }, { data: links }] = await Promise.all([
        sb.from("people").select("id").in("company_id", scope.length ? scope : [-1]),
        sb.from("person_companies").select("person_id").in("company_id", scope.length ? scope : [-1]),
      ]);
      return new Set<number>([me.id, ...(main ?? []).map((r) => r.id as number), ...(links ?? []).map((r) => r.person_id as number)]);
    });
  }
  const [entries, allowed] = await Promise.all([allFaces(), allowedFor]);
  const faces: Record<string, [FaceRole, FaceMood]> = {};
  for (const e of entries) if (!allowed || allowed.has(e.id)) faces[e.key] = e.face;
  // The owner, as updates name them.
  faces[faceKey("Administrator")] = ["owner", "idle"];
  return NextResponse.json({ faces }, { headers: { "Cache-Control": "private, max-age=300" } });
}

async function computeFaces(): Promise<Entry[]> {
  const now = Date.now();
  const [{ data: people }, rows, { data: events }] = await Promise.all([
    sb.from("people").select("id,name,portal_role,portal_enabled_at,active").eq("active", true),
    getAllTasks(),
    sb.from("calendar_events").select("start_at,end_at,all_day,attendees,status")
      .gte("start_at", new Date(now - 12 * 3_600_000).toISOString())
      .lte("start_at", new Date(now).toISOString()),
  ]);

  // Who is in a meeting right now (a timed event under way that names them).
  const inMeeting = new Set<number>();
  for (const e of events ?? []) {
    if (e.all_day || e.status === "cancelled") continue;
    const start = new Date(e.start_at as string).getTime();
    const end = e.end_at ? new Date(e.end_at as string).getTime() : start + 3_600_000;
    if (start > now || end < now) continue;
    for (const a of (Array.isArray(e.attendees) ? e.attendees : []) as { personId?: number }[]) {
      if (typeof a?.personId === "number") inMeeting.add(a.personId);
    }
  }

  const monthStart = new Date(new Date(now + 3 * 3_600_000).toISOString().slice(0, 8) + "01T00:00:00+03:00").getTime();
  const stats = new Map<string, FaceStats>();
  const statsFor = (name: string) => {
    const k = faceKey(name);
    let s = stats.get(k);
    if (!s) { s = { open: 0, overdue: 0, dueSoon: 0, inProgress: 0, doneThisMonth: 0, inMeeting: false }; stats.set(k, s); }
    return s;
  };
  for (const r of rows) {
    const done = r.status === "Completed" || r.status === "Closed";
    for (const name of r.assignees) {
      const s = statsFor(name);
      if (done) {
        if (r.closedDate && r.closedDate.getTime() >= monthStart) s.doneThisMonth++;
        continue;
      }
      s.open++;
      if (r.flag === "overdue" || r.flag === "escalate-now") s.overdue++;
      else if (r.flag === "due-soon") s.dueSoon++;
      if (r.status === "In Progress") s.inProgress++;
    }
  }

  const out: Entry[] = [];
  for (const p of people ?? []) {
    const role: FaceRole = p.portal_enabled_at
      ? (["director", "manager"].includes(p.portal_role as string) ? (p.portal_role as FaceRole) : "staff")
      : "none";
    const s = stats.get(faceKey(p.name as string)) ?? { open: 0, overdue: 0, dueSoon: 0, inProgress: 0, doneThisMonth: 0, inMeeting: false };
    s.inMeeting = inMeeting.has(p.id as number);
    out.push({ id: p.id as number, key: faceKey(p.name as string), face: [role, moodFor(s)] });
  }
  return out;
}
