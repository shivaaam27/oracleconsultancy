"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { logChangeSb, insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { parseMentionIds } from "@/lib/mentions";
import { createTaskAttachment, createDocument, uploadDocumentFile } from "@/lib/documents";
import { logPersonRequirementEvent } from "@/lib/compliance-audit";
import { createLeaveRequestAction } from "@/app/hrms/leave/actions";
import { createEventAction } from "@/app/calendar/actions";
import { createNotification, notifyMany, notifyPinned, personRecipient, recipientForCreatedBy } from "@/lib/notifications";
import {
  clearSessionCookie,
  directReportIds,
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
  // The "last login" stamp isn't needed before the redirect — defer it so the
  // staff member lands on their portal a round-trip sooner.
  const personId = person.id as number;
  after(() => {
    sb.from("people").update({ portal_last_login_at: new Date().toISOString() }).eq("id", personId);
  });
  redirect("/portal");
}

export async function portalLogout() {
  await clearSessionCookie();
  redirect("/portal/login");
}

/* ----------------------------------------------------------------------
 * T5 — managers create & assign tasks from the portal. A manager can only
 * assign to themselves + their direct reports, and only within companies
 * those people belong to. The instruction becomes the first pinned message.
 * ---------------------------------------------------------------------- */

function idList(formData: FormData, key: string): number[] {
  return formData
    .getAll(key)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function portalCreateTask(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "manager") return { error: "Only managers can create tasks." };

  const actionItem = String(formData.get("actionItem") ?? "").trim();
  const companyId = Number(formData.get("companyId"));
  const priority = String(formData.get("priority") ?? "Medium");
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const accountableId = Number(formData.get("accountableId"));
  const workingIds = idList(formData, "workingIds");
  const instruction = String(formData.get("instruction") ?? "").trim();
  if (!actionItem) return { error: "Give the task a title." };
  if (!Number.isFinite(companyId)) return { error: "Choose a company." };

  // Who/what this manager may touch.
  const allowedPeople = new Set([me.id, ...(await directReportIds(me.id))]);
  if (!allowedPeople.has(accountableId)) return { error: "You can only assign to yourself or your team." };
  const workings = workingIds.filter((id) => allowedPeople.has(id) && id !== accountableId);

  // Restrict the company to ones the allowed people belong to.
  const { data: peopleRows } = await sb.from("people").select("company_id").in("id", [...allowedPeople]);
  const allowedCompanies = new Set((peopleRows ?? []).map((p) => p.company_id as number).filter(Boolean));
  if (!allowedCompanies.has(companyId)) return { error: "You can't create tasks for that company." };

  const { data: company } = await sb.from("companies").select("code,code_prefix").eq("id", companyId).maybeSingle();
  if (!company) return { error: "Company not found." };

  const now = new Date();
  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  const createdBy = `portal-mgr:${me.name}`;

  const task = await insertTaskWithUniqueCodeSb(companyId, (company.code_prefix as string | null) || (company.code as string), {
    actionItem,
    ownerId: accountableId,
    status: "Not Started",
    priority,
    deadline: deadline && !isNaN(deadline.getTime()) ? deadline : null,
    createdDate: now,
    lastUpdatedAt: now,
    latestUpdate: instruction || null,
    archived: false,
  });

  // Assignees: the accountable person + working people.
  const rows = [
    { task_id: task.id, person_id: accountableId, role: "accountable" },
    ...workings.map((id) => ({ task_id: task.id, person_id: id, role: "working" })),
  ];
  await sb.from("task_assignees").upsert(rows, { onConflict: "task_id,person_id", ignoreDuplicates: true });

  // The instruction becomes the first pinned message.
  if (instruction) {
    await sb.from("task_updates").insert({
      task_id: task.id,
      body: instruction,
      created_at: now.toISOString(),
      created_by: createdBy,
      pinned_at: now.toISOString(),
    });
  }

  await sb.from("audit_log").insert({
    task_id: task.id,
    task_code: task.code,
    company_id: companyId,
    entry_type: "CREATE",
    field: "Task",
    old_value: null,
    new_value: actionItem,
    change_reason: null,
    created_at: now.toISOString(),
    created_by: createdBy,
  });

  // Notify the assignees (except the creator) + the owner's bell.
  const recipients = [accountableId, ...workings].filter((id) => id !== me.id).map(personRecipient);
  recipients.push("admin");
  await notifyMany(recipients, {
    kind: "assigned",
    taskId: task.id,
    taskCode: task.code,
    title: `${me.name} assigned you a task`,
    body: actionItem,
    actor: me.name,
  });

  revalidatePath("/portal");
  revalidatePath("/");
  redirect(`/portal/task/${task.code}`);
}

/** Director: schedule a calendar event / meeting (any company). Reuses the
 *  calendar engine (attendees, .ics invites, reminders, recurrence). */
export async function portalDirectorCreateEvent(
  formData: FormData
): Promise<{ ok: true; id?: number } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") return { ok: false, error: "Only directors can do this." };
  const res = await createEventAction(formData);
  if (res.ok) revalidatePath("/portal/board");
  return res;
}

/* ----------------------------------------------------------------------
 * Director (executive operator) — create & assign a task in ANY company,
 * to ANY active person. Group-wide; stamped portal-dir:<Name>; audit-logged.
 * ---------------------------------------------------------------------- */
export async function portalDirectorCreateTask(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") return { error: "Only directors can do this." };

  const actionItem = String(formData.get("actionItem") ?? "").trim();
  const companyId = Number(formData.get("companyId"));
  const priority = String(formData.get("priority") ?? "Medium");
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const accountableId = Number(formData.get("accountableId"));
  const workingIds = idList(formData, "workingIds");
  const instruction = String(formData.get("instruction") ?? "").trim();
  if (!actionItem) return { error: "Give the task a title." };
  if (!Number.isFinite(companyId)) return { error: "Choose a company." };
  if (!Number.isFinite(accountableId)) return { error: "Choose who is responsible." };

  // Group-wide: the only constraint is that the people are real + active.
  const { data: activeRows } = await sb.from("people").select("id").eq("active", true).in("id", [accountableId, ...workingIds]);
  const activeSet = new Set((activeRows ?? []).map((r) => r.id as number));
  if (!activeSet.has(accountableId)) return { error: "The responsible person isn't available." };
  const workings = workingIds.filter((id) => activeSet.has(id) && id !== accountableId);

  const { data: company } = await sb.from("companies").select("code,code_prefix").eq("id", companyId).maybeSingle();
  if (!company) return { error: "Company not found." };

  const now = new Date();
  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  const createdBy = `portal-dir:${me.name}`;

  const task = await insertTaskWithUniqueCodeSb(companyId, (company.code_prefix as string | null) || (company.code as string), {
    actionItem, ownerId: accountableId, status: "Not Started", priority,
    deadline: deadline && !isNaN(deadline.getTime()) ? deadline : null,
    createdDate: now, lastUpdatedAt: now, latestUpdate: instruction || null, archived: false,
  });

  const rows = [
    { task_id: task.id, person_id: accountableId, role: "accountable" },
    ...workings.map((id) => ({ task_id: task.id, person_id: id, role: "working" })),
  ];
  await sb.from("task_assignees").upsert(rows, { onConflict: "task_id,person_id", ignoreDuplicates: true });

  if (instruction) {
    await sb.from("task_updates").insert({
      task_id: task.id, body: instruction, created_at: now.toISOString(), created_by: createdBy, pinned_at: now.toISOString(),
    });
  }

  await sb.from("audit_log").insert({
    task_id: task.id, task_code: task.code, company_id: companyId,
    entry_type: "CREATE", field: "Task", old_value: null, new_value: actionItem,
    change_reason: "Created by director", created_at: now.toISOString(), created_by: createdBy,
  });

  const recipients = [accountableId, ...workings].map(personRecipient);
  recipients.push("admin");
  await notifyMany(recipients, {
    kind: "assigned", taskId: task.id, taskCode: task.code,
    title: `${me.name} assigned you a task`, body: actionItem, actor: me.name,
  });

  revalidatePath("/portal/board");
  revalidatePath("/");
  redirect(`/portal/board?created=${task.code}`);
}

export async function portalAddUpdate(formData: FormData) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const taskId = Number(formData.get("taskId"));
  const code = String(formData.get("code") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const newStatus = String(formData.get("newStatus") ?? "").trim();
  const parentRaw = Number(formData.get("parentUpdateId"));
  const fileEntry = formData.get("attachment");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  // A message must have text OR a file.
  if (!Number.isFinite(taskId) || (!body && !file)) return;
  if (!(await personCanSeeTask(me, taskId))) return;

  // Validate the reply target belongs to this same task.
  let parentUpdateId: number | null = null;
  let parentCreatedBy: string | null = null;
  if (Number.isFinite(parentRaw) && parentRaw > 0) {
    const { data: parent } = await sb
      .from("task_updates")
      .select("task_id,created_by")
      .eq("id", parentRaw)
      .maybeSingle();
    if (parent && (parent.task_id as number) === taskId) {
      parentUpdateId = parentRaw;
      parentCreatedBy = (parent.created_by as string | null) ?? null;
    }
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

  // Store an attached file as a real Document (linked to this task).
  let attachmentDocumentId: number | null = null;
  if (file) {
    attachmentDocumentId = await createTaskAttachment({
      taskId,
      companyId: t.company_id as number | null,
      file,
      createdBy,
    });
  }

  const messageBody = body || `📎 ${file?.name ?? "Attachment"}`;

  const { data: inserted, error: insErr } = await sb
    .from("task_updates")
    .insert({
      task_id: taskId,
      body: messageBody,
      created_at: now,
      created_by: createdBy,
      parent_update_id: parentUpdateId,
      attachment_document_id: attachmentDocumentId,
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

  // Notifications: @mention → mentioned people; reply → the replied-to author.
  const code2 = t.code as string;
  await notifyMany(mentionIds.map(personRecipient), {
    kind: "mention",
    taskId,
    taskCode: code2,
    title: `${me.name} mentioned you`,
    body,
    actor: me.name,
  });
  if (parentUpdateId) {
    const target = await recipientForCreatedBy(parentCreatedBy);
    if (target && target !== personRecipient(me.id)) {
      await createNotification({
        recipient: target,
        kind: "reply",
        taskId,
        taskCode: code2,
        title: `${me.name} replied to you`,
        body,
        actor: me.name,
      });
    }
  }

  const patch: Record<string, unknown> = { latest_update: messageBody, last_updated_at: now };

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

/* ----------------------------------------------------------------------
 * Document compliance — staff upload their own required documents. The file
 * is filed as the person's own Document and linked to the checklist item as
 * "received"; verification stays with the administrator. We re-verify the
 * requirement belongs to the signed-in person — never trust the form.
 * ---------------------------------------------------------------------- */
const MAX_PORTAL_DOC_BYTES = 15 * 1024 * 1024; // 15 MB

export async function portalUploadRequirementDocument(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const requirementId = Number(formData.get("requirementId"));
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  if (!Number.isFinite(requirementId)) return { ok: false, error: "Missing requirement." };
  if (!file) return { ok: false, error: "Choose a file to upload." };
  if (file.size > MAX_PORTAL_DOC_BYTES) return { ok: false, error: "That file is too large (max 15 MB)." };

  // Authorise: the requirement must belong to THIS person.
  const { data: req } = await sb
    .from("person_requirements")
    .select("id,person_id,label,category")
    .eq("id", requirementId)
    .maybeSingle();
  if (!req || (req.person_id as number) !== me.id) {
    return { ok: false, error: "That document isn't on your checklist." };
  }

  const createdBy = `portal:${me.name}`;
  const label = (req.label as string | null) ?? file.name;
  const category = (req.category as string | null) ?? null;

  try {
    const docId = await createDocument(
      { title: label, personId: me.id, category, notes: `Uploaded by ${me.name} via the staff portal.` },
      createdBy
    );
    await uploadDocumentFile(docId, file);

    // Link to the checklist item as "received" (awaiting admin verification).
    const now = new Date().toISOString();
    await sb
      .from("person_requirements")
      .update({ document_id: docId, status: "received", received_at: now, updated_at: now, auto_link: true })
      .eq("id", requirementId);
    await logPersonRequirementEvent(requirementId, "linked", {
      documentId: docId,
      detail: label,
      ownerId: me.id,
      label,
      createdBy,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not upload the document." };
  }

  revalidatePath("/portal/profile");
  revalidatePath("/documents");
  revalidatePath("/people");
  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Leave self-service. Staff request their own leave; managers approve/reject
 * their direct reports'. Always forces the actor server-side — never the form.
 * ---------------------------------------------------------------------- */
export async function portalRequestLeave(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // The request is always for the signed-in person — ignore any personId in the form.
  formData.set("personId", String(me.id));
  const res = await createLeaveRequestAction(formData);
  if (res.ok) {
    revalidatePath("/portal/profile");
    revalidatePath("/portal");
    return { ok: true };
  }
  return { ok: false, error: res.error };
}

export async function portalDecideLeave(
  requestId: number,
  status: "Approved" | "Rejected"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "manager") return { ok: false, error: "Only managers can decide leave." };

  const { data: req } = await sb.from("leave_requests").select("person_id,status").eq("id", requestId).maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if ((req.status as string) !== "Pending") return { ok: false, error: "That request was already decided." };

  // Authorise: the requester must be one of this manager's direct reports.
  const reports = await directReportIds(me.id);
  if (!reports.includes(req.person_id as number)) return { ok: false, error: "That isn't one of your team members." };

  const now = new Date().toISOString();
  const { error } = await sb
    .from("leave_requests")
    .update({ status, decided_by: `portal-mgr:${me.name}`, decided_at: now, updated_at: now })
    .eq("id", requestId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal");
  revalidatePath("/hrms/leave");
  revalidatePath("/people");
  return { ok: true };
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

  const wasPinned = Boolean(u.pinned_at);
  await sb
    .from("task_updates")
    .update({ pinned_at: wasPinned ? null : new Date().toISOString() })
    .eq("id", updateId);

  // Pinning a NEW instruction notifies the task's people (except the pinner).
  if (!wasPinned) {
    await notifyPinned(u.task_id as number, code, me.name, me.id);
  }

  revalidatePath(`/portal/task/${code}`);
  revalidatePath(`/task/${code}`);
}
