"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { logChangeSb } from "@/lib/db-helpers";
import { parseMentionIds } from "@/lib/mentions";
import {
  clearSessionCookie,
  getPortalPerson,
  personCanSeeTask,
  setSessionCookie,
  verifyPassword,
} from "@/lib/portal-auth";

/* Staff portal actions. Every mutation re-verifies the session AND that
 * the person is actually allowed on the task — never trust the URL/form. */

// Statuses a staff member may set themselves: Completed/Closed need a
// manager or the owner — staff signal "done" via Under Review.
const STAFF_STATUSES = ["In Progress", "Under Review", "Blocked"];
// Managers may additionally complete a task outright.
const MANAGER_STATUSES = [...STAFF_STATUSES, "Completed"];

export async function portalLogin(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) return { error: "Enter your name/email and password." };

  // Match by email first (exact), then by name (case-insensitive).
  const { data: byEmail } = await sb
    .from("people")
    .select("id,portal_password_hash,active")
    .ilike("email", identifier)
    .not("portal_password_hash", "is", null)
    .maybeSingle();
  let person = byEmail;
  if (!person) {
    const { data: byName } = await sb
      .from("people")
      .select("id,portal_password_hash,active")
      .ilike("name", identifier)
      .not("portal_password_hash", "is", null)
      .maybeSingle();
    person = byName;
  }

  if (
    !person ||
    !person.active ||
    !verifyPassword(password, person.portal_password_hash as string)
  ) {
    return { error: "Sign-in details not recognised. Check with your administrator." };
  }

  await setSessionCookie(person.id as number);
  await sb
    .from("people")
    .update({ portal_last_login_at: new Date().toISOString() })
    .eq("id", person.id);
  redirect("/portal");
}

export async function portalLogout() {
  await clearSessionCookie();
  redirect("/portal/login");
}

export async function portalAddUpdate(formData: FormData) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const taskId = Number(formData.get("taskId"));
  const code = String(formData.get("code") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const newStatus = String(formData.get("newStatus") ?? "").trim();
  const parentRaw = Number(formData.get("parentUpdateId"));
  if (!Number.isFinite(taskId) || !body) return;
  if (!(await personCanSeeTask(me, taskId))) return;

  // Validate the reply target belongs to this same task.
  let parentUpdateId: number | null = null;
  if (Number.isFinite(parentRaw) && parentRaw > 0) {
    const { data: parent } = await sb
      .from("task_updates")
      .select("task_id")
      .eq("id", parentRaw)
      .maybeSingle();
    if (parent && (parent.task_id as number) === taskId) parentUpdateId = parentRaw;
  }

  const { data: t, error: tErr } = await sb
    .from("tasks")
    .select("id,status,company_id,code")
    .eq("id", taskId)
    .maybeSingle();
  if (tErr || !t) return;

  const isManager = me.portalRole === "manager";
  // Managers are stamped distinctly so their posts get the management accent
  // everywhere (see authorOf in the portal task page and actorLabel in
  // timeline-entry.tsx).
  const createdBy = `${isManager ? "portal-mgr" : "portal"}:${me.name}`;
  const now = new Date().toISOString();

  const { data: inserted, error: insErr } = await sb
    .from("task_updates")
    .insert({
      task_id: taskId,
      body,
      created_at: now,
      created_by: createdBy,
      parent_update_id: parentUpdateId,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);

  // Record @mentions — re-parsed server-side against this task's people, so
  // we never trust the client's list. Drives highlight now, notifications (T4).
  const { data: taskPeople } = await sb
    .from("task_assignees")
    .select("people(id,name)")
    .eq("task_id", taskId);
  const candidates = (taskPeople ?? [])
    .map((r) => r.people as unknown as { id: number; name: string } | null)
    .filter((p): p is { id: number; name: string } => Boolean(p));
  const mentionIds = parseMentionIds(body, candidates).filter((id) => id !== me.id);
  if (mentionIds.length > 0) {
    await sb
      .from("update_mentions")
      .insert(mentionIds.map((personId) => ({ update_id: inserted.id as number, person_id: personId })));
  }

  const patch: Record<string, unknown> = { latest_update: body, last_updated_at: now };

  // Optional status change, limited to the role's allowed set, and never
  // on a task that is already Completed/Closed.
  const allowed = isManager ? MANAGER_STATUSES : STAFF_STATUSES;
  const currentStatus = t.status as string;
  const canChange =
    newStatus &&
    allowed.includes(newStatus) &&
    newStatus !== currentStatus &&
    currentStatus !== "Completed" &&
    currentStatus !== "Closed";
  if (canChange) {
    patch.status = newStatus;
    if (newStatus === "Completed") patch.closed_date = now;
    await logChangeSb(
      taskId,
      t.code as string,
      t.company_id as number,
      "status",
      currentStatus,
      newStatus,
      isManager ? "Completed/updated from manager portal" : "Updated from staff portal",
      createdBy
    );
  }

  const { error: upErr } = await sb.from("tasks").update(patch).eq("id", taskId);
  if (upErr) throw new Error(upErr.message);

  revalidatePath(`/portal/task/${code}`);
  revalidatePath(`/task/${code}`);
  revalidatePath("/portal");
}

/** Any portal person on the task: confirm they have read an update
 *  ("Understood"). Idempotent — re-tapping is harmless. */
export async function portalAcknowledge(formData: FormData) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const updateId = Number(formData.get("updateId"));
  const code = String(formData.get("code") ?? "");
  if (!Number.isFinite(updateId)) return;

  const { data: u } = await sb
    .from("task_updates")
    .select("id,task_id")
    .eq("id", updateId)
    .maybeSingle();
  if (!u) return;
  if (!(await personCanSeeTask(me, u.task_id as number))) return;

  await sb
    .from("update_acks")
    .upsert(
      { update_id: updateId, person_id: me.id, acknowledged_at: new Date().toISOString() },
      { onConflict: "update_id,person_id" }
    );

  revalidatePath(`/portal/task/${code}`);
  revalidatePath(`/task/${code}`);
}

/** Managers only: pin/unpin an update so the current instruction stays on
 *  top of the timeline for the whole team. */
export async function portalTogglePin(formData: FormData) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "manager") return;

  const updateId = Number(formData.get("updateId"));
  const code = String(formData.get("code") ?? "");
  if (!Number.isFinite(updateId)) return;

  const { data: u } = await sb
    .from("task_updates")
    .select("id,task_id,pinned_at")
    .eq("id", updateId)
    .maybeSingle();
  if (!u) return;
  if (!(await personCanSeeTask(me, u.task_id as number))) return;

  await sb
    .from("task_updates")
    .update({ pinned_at: u.pinned_at ? null : new Date().toISOString() })
    .eq("id", updateId);

  revalidatePath(`/portal/task/${code}`);
  revalidatePath(`/task/${code}`);
}
