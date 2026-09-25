import { NextRequest, NextResponse } from "next/server";
import { getTaskRowFresh } from "@/lib/queries";
import { sb } from "@/db/supabase";
import { recordTaskView, personCanSeeTask } from "@/lib/portal-auth";
import { getViewer, type Viewer } from "@/lib/viewer";
import { viewerPeopleIds } from "@/lib/viewer-scope";
import { STATUSES } from "@/lib/constants";
import type { ConvoMessage, ConvoEvent } from "@/components/portal-conversation";
import { taskRecurrence } from "@/app/task/recurring-actions";

export const dynamic = "force-dynamic";

/** Map a stored `created_by` discriminator to a display author (admin view). */
/** Who wrote an update, as the person LOOKING sees it: to the owner their own
 *  words are "You"; to a director the owner is "Administrator" and the
 *  director's own words are "You". */
function authorFor(viewer: Viewer, by: string | null): { name: string; management: boolean; me: boolean } {
  if (viewer.kind === "director") {
    // Only their OWN words sit on their side of the thread (the Studio thread
    // puts `management` on the reader's side, which is the owner's view).
    if (by === "web-ui") return { name: "Administrator", management: false, me: false };
    if (by === viewer.actor) return { name: "You", management: true, me: true };
    return { ...adminAuthorOf(by), management: false, me: false };
  }
  return adminAuthorOf(by);
}

function adminAuthorOf(by: string | null): { name: string; management: boolean; me: boolean } {
  if (!by) return { name: "System", management: false, me: false };
  if (by === "web-ui") return { name: "You", management: true, me: true };
  if (by === "ai-command") return { name: "ORI", management: true, me: false };
  if (by === "meeting-mode") return { name: "Meeting", management: true, me: false };
  if (by.startsWith("portal-mgr:")) return { name: by.slice(11), management: true, me: false };
  if (by.startsWith("portal:")) return { name: by.slice(7), management: false, me: false };
  // Written through Claude (MCP): "mcp:Owner" is the owner, else the staff name.
  if (by === "mcp:Owner") return { name: "You", management: true, me: true };
  if (by.startsWith("mcp:")) return { name: by.slice(4), management: false, me: false };
  return { name: by, management: true, me: false };
}

export async function GET(req: NextRequest) {
  // ⚠️ The front door lets a DIRECTOR reach this route too (src/proxy.ts), so it
  // checks who is asking itself: the owner, or a director for a task in their
  // companies. Anyone else gets nothing.
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  // Accept the current code or a legacy code (old links). Read FRESH, one task:
  // ⚠️ this used to search getAllTasks, whose 30-second memo is per server
  // instance — so right after a change the record could show the OLD value —
  // and which leaves archived tasks out, so an archived task opened as "No
  // task …" and its Restore button could never be reached.
  const task = await getTaskRowFresh(code);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Stamp the owner's view so portal users see "Seen by Management" — and so
  // the task's unread dot clears. NOT on a peek: the Tasks page reads the task
  // under the pointer ahead of time (lib/task-detail-cache.ts), and a task that
  // was only hovered over has not been read.
  if (viewer.kind === "director" && !(await personCanSeeTask(viewer.person, task.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // A peek (read-ahead) never marks a task read; a real open marks it read for
  // whoever is looking — the owner as "admin", a director as themselves.
  if (req.nextUrl.searchParams.get("peek") !== "1") {
    await recordTaskView(task.id, viewer.kind === "director" ? `person:${viewer.person.id}` : "admin");
  }

  const [{ data: updateRaw }, { data: auditRaw }, { data: sourceMeeting }, { data: pplRaw }, { data: compRaw }, { data: deptRaw }] =
    await Promise.all([
      sb
        .from("task_updates")
        .select("id,body,created_at,created_by,edited_at,original_body,pinned_at,parent_update_id,attachment_document_id")
        .eq("task_id", task.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      sb
        .from("audit_log")
        .select("id,field,old_value,new_value,change_reason,entry_type,created_at,created_by")
        .eq("task_code", task.code)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      sb
        .from("meeting_tasks")
        .select("meetings(id,title,meeting_date)")
        .eq("task_id", task.id)
        .maybeSingle(),
      sb.from("people").select("id,name").eq("active", true).order("name"),
      sb.from("companies").select("id,name").order("name"),
      sb.from("departments").select("name").order("name"),
    ]);

  const updates = updateRaw ?? [];
  const audits = auditRaw ?? [];

  // Acknowledgements on pinned instructions, so the owner sees who has read.
  const pinnedUpdateIds = updates.filter((u) => u.pinned_at).map((u) => u.id as number);
  const ackMap = new Map<number, string[]>();
  if (pinnedUpdateIds.length > 0) {
    const { data: acks } = await sb.from("update_acks").select("update_id,people(name)").in("update_id", pinnedUpdateIds);
    for (const a of acks ?? []) {
      const uid = a.update_id as number;
      const nm = (a.people as unknown as { name: string } | null)?.name ?? "Someone";
      ackMap.set(uid, [...(ackMap.get(uid) ?? []), nm]);
    }
  }

  // Attachment file names for messages carrying a document.
  const attIds = updates.map((u) => u.attachment_document_id as number | null).filter((x): x is number => x != null);
  const attachName = new Map<number, string>();
  if (attIds.length > 0) {
    const { data: docs } = await sb.from("documents").select("id,file_name,title").in("id", attIds);
    for (const d of docs ?? []) attachName.set(d.id as number, (d.file_name as string | null) || (d.title as string) || "Attachment");
  }

  // Team (assignees) for @mention autocomplete + name resolution.
  const team = task.assigneeIds.map((id, i) => ({ id, name: task.assignees[i] }));
  const teamName = new Map(team.map((p) => [p.id, p.name]));

  // Who has seen since the latest message (portal viewers).
  const { data: viewRows } = await sb.from("task_views").select("viewer,last_viewed_at").eq("task_id", task.id);
  const latestUpd = updates[0] ?? null;
  const seenLabel: string[] = [];
  if (latestUpd) {
    for (const v of viewRows ?? []) {
      if (new Date(v.last_viewed_at as string) < new Date(latestUpd.created_at as string)) continue;
      const viewer = v.viewer as string;
      if (viewer.startsWith("person:")) {
        const nm = teamName.get(Number(viewer.slice(7)));
        if (nm) seenLabel.push(nm);
      }
    }
  }

  const updBodyById = new Map(updates.map((u) => [u.id as number, u.body as string]));

  const convoMessages: ConvoMessage[] = updates.map((u) => {
    const a = authorFor(viewer, u.created_by as string | null);
    const pid = u.parent_update_id as number | null;
    const parent =
      pid && updBodyById.has(pid)
        ? {
            authorName: authorFor(viewer, (updates.find((x) => x.id === pid)?.created_by as string | null) ?? null).name,
            snippet: updBodyById.get(pid)!.slice(0, 80),
          }
        : null;
    const aid = u.attachment_document_id as number | null;
    return {
      id: u.id as number,
      body: u.body as string,
      at: u.created_at as string,
      authorName: a.name,
      management: a.management,
      me: a.me,
      pinned: Boolean(u.pinned_at),
      parent,
      ackNames: u.pinned_at ? ackMap.get(u.id as number) ?? [] : [],
      iAcked: false,
      attachment: aid && attachName.has(aid) ? { name: attachName.get(aid)! } : null,
    };
  });

  const fmtEvDate = (v: string) => {
    const dd = new Date(v);
    return isNaN(dd.getTime()) ? v : dd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const convoEvents: ConvoEvent[] = audits
    .filter(
      (a) =>
        (a.entry_type as string) === "CHANGE" &&
        ["status", "deadline", "priority", "risk", "escalation"].includes(String(a.field).toLowerCase())
    )
    .map((a) => {
      const f = String(a.field).toLowerCase();
      const nv = (a.new_value as string | null) ?? "";
      let text: string;
      if (f === "status") text = `Status → ${nv}`;
      else if (f === "deadline") text = nv ? `Deadline → ${fmtEvDate(nv)}` : "Deadline cleared";
      else if (f === "priority") text = `Priority → ${nv}`;
      else if (f === "risk") text = `Risk → ${nv}`;
      else text = nv ? `Escalation → ${nv}` : "Escalation cleared";
      return { id: `a${a.id}`, at: a.created_at as string, text };
    });

  const inScopePeople = await viewerPeopleIds(viewer);
  return NextResponse.json({
    // The owner's alone: Notes (the record hides its Notes tab for anyone else).
    ownerView: viewer.kind === "owner",
    task,
    updates,
    audit: audits,
    sourceMeeting: (sourceMeeting as unknown as { meetings?: { id: number; title: string; meeting_date: string } })?.meetings ?? null,
    convoMessages,
    convoEvents,
    team,
    seenLabel,
    latestId: latestUpd ? (latestUpd.id as number) : null,
    statusOptions: STATUSES.filter((s) => s !== task.status),
    people: (pplRaw ?? []).filter((p) => !inScopePeople || inScopePeople.has(p.id as number)).map((p) => ({ id: p.id as number, name: p.name as string })),
    // The standing rule this task came from (null = does not repeat), so the
    // record can say so and change it — migration 0166.
    recurrence: await taskRecurrence(task.id),
    companies: (compRaw ?? []).filter((c) => viewer.scope == null || viewer.scope.includes(c.id as number)).map((c) => ({ id: c.id as number, name: c.name as string })),
    departments: (deptRaw ?? []).map((d) => d.name as string),
  });
}
