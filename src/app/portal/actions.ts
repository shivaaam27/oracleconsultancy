"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { logChangeSb } from "@/lib/db-helpers";
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
  if (!Number.isFinite(taskId) || !body) return;
  if (!(await personCanSeeTask(me, taskId))) return;

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

  const { error: insErr } = await sb.from("task_updates").insert({
    task_id: taskId,
    body,
    created_at: now,
    created_by: createdBy,
  });
  if (insErr) throw new Error(insErr.message);

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
