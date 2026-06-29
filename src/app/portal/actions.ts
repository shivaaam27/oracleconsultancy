"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { logChangeSb, insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { parseMentionIds } from "@/lib/mentions";
import { createTaskAttachment, createDocument, uploadDocumentFile } from "@/lib/documents";
import { extractDocumentFromFile } from "@/app/documents/actions";
import { logPersonRequirementEvent } from "@/lib/compliance-audit";
import { createLeaveRequestAction } from "@/app/hrms/leave/actions";
import { ATTENDANCE_SELF_STATUSES } from "@/lib/leave-shared";
import { createEventAction, sendEventInviteAction } from "@/app/calendar/actions";
import { recordEvent } from "@/lib/system-events";
import { createNotification, notifyMany, notifyPinned, personRecipient, recipientForCreatedBy } from "@/lib/notifications";
import type { NotifKind } from "@/lib/notifications";
import { broadcastPulse } from "@/lib/cos-pulse";
import {
  clearSessionCookie,
  findPortalPersonByIdentifier,
  getPortalPerson,
  managerTeamIds,
  personCanSeePerson,
  personCanSeeTask,
  setSessionCookie,
  verifyPassword,
} from "@/lib/portal-auth";
import { computeClosedDate, isClosedStatus } from "@/lib/task-status";
import { canManageTask } from "@/lib/task-permissions";
import { reindexEntity } from "@/lib/index-hooks";
import { createGroup, getOrCreateDm, personParticipant, sendMessage, threadFromTask } from "@/lib/chat";
import { callerIp, lockMessage, loginLockState, recordLoginFailure, recordLoginSuccess } from "@/lib/login-throttle";

/* Staff portal actions. Every mutation re-verifies the session AND that
 * the person is actually allowed on the task — never trust the URL/form. */

// Statuses a staff member may set themselves: Completed/Closed need a
// manager or the owner — staff signal "done" via Under Review.
const STAFF_STATUSES = ["In Progress", "Under Review", "Blocked"];

export async function portalLogin(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) return { error: "Enter your name/email and password." };

  // Brute-force guard: slow repeated guesses against the same account/source.
  const key = "portal:" + identifier.toLowerCase() + ":" + (await callerIp());
  const lock = loginLockState(key);
  if (lock.locked) return { error: lockMessage(lock.retryAfterSec) };

  // Resolve via the shared helper, which escapes LIKE metacharacters so a name
  // containing % or _ can't be used to authenticate against a partially-known
  // person or to probe who has portal access (AUTHSEC-01).
  const person = await findPortalPersonByIdentifier(identifier);

  if (
    !person ||
    !person.active ||
    !verifyPassword(password, person.portal_password_hash as string)
  ) {
    recordLoginFailure(key);
    return { error: "Sign-in details not recognised. Check with your administrator." };
  }

  recordLoginSuccess(key);
  await setSessionCookie(person.id as number);
  // The "last login" stamp isn't needed before the redirect — defer it so the
  // staff member lands on their portal a round-trip sooner.
  const personId = person.id as number;
  after(() => {
    sb.from("people").update({ portal_last_login_at: new Date().toISOString() }).eq("id", personId);
  });
  // Land directors straight on their board. Going via /portal (which then
  // re-redirects directors to /portal/board) is a second redirect hop that
  // intermittently shows "the page couldn't load" until a manual reload.
  redirect(person.portal_role === "director" ? "/portal/board" : "/portal");
}

/* Sign out lands on the unified login screen (/login), NOT /portal/login — so
 * every role (staff, manager, director, and the owner) returns to the same
 * default sign-in, with the Staff Login / Command Centre tabs. */
export async function portalLogout() {
  await clearSessionCookie();
  redirect("/login");
}

/* ----------------------------------------------------------------------
 * Self-service password change. Any portal person (staff/manager/director) can
 * change their OWN sign-in password from their profile — they no longer need to
 * ask the administrator. Re-verifies the current password before changing it.
 * ---------------------------------------------------------------------- */
export async function portalChangePassword(
  _prev: { ok?: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok?: boolean; error?: string } | null> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current || !next) return { error: "Fill in both your current and new password." };
  if (next.length < 8) return { error: "Your new password must be at least 8 characters." };
  if (next !== confirm) return { error: "The new passwords don't match." };

  const { data: row } = await sb
    .from("people")
    .select("portal_password_hash")
    .eq("id", me.id)
    .maybeSingle();
  const stored = (row?.portal_password_hash as string | null) ?? null;
  if (!stored || !verifyPassword(current, stored)) {
    return { error: "Your current password isn't right." };
  }
  if (verifyPassword(next, stored)) {
    return { error: "Choose a password different from your current one." };
  }

  const { hashPassword } = await import("@/lib/portal-auth");
  const { error } = await sb
    .from("people")
    .update({ portal_password_hash: hashPassword(next) })
    .eq("id", me.id);
  if (error) return { error: "Could not update your password. Try again." };

  // The session token is bound to the password hash, so rotating it logs out
  // every device (the AUTHSEC-02 control). Re-issue the cookie for THIS device
  // off the new hash so the person who just changed their password stays signed
  // in here — only the other devices are dropped.
  await setSessionCookie(me.id);

  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Self-service contact details. Any portal person may keep their OWN contact
 * columns up to date from their profile — phone, WhatsApp, address and next-of-
 * kin. Strictly self-scoped (WHERE id = me.id) and limited to these columns:
 * pay, IDs, role and company are never touched here. Undefined fields are left
 * as-is; only genuinely changed values are written + audited.
 * ---------------------------------------------------------------------- */
export async function portalStaffUpdateContact(input: {
  phone?: string;
  whatsapp?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Please sign in again." };

  // Normalise: trim, and treat an emptied field as a cleared value (null).
  // `undefined` means "not provided" — leave that column untouched.
  const norm = (v: string | undefined): string | null | undefined =>
    v === undefined ? undefined : v.trim() || null;
  const fields: Array<{ key: string; col: string; value: string | null | undefined }> = [
    { key: "phone", col: "phone", value: norm(input.phone) },
    { key: "whatsapp", col: "whatsapp", value: norm(input.whatsapp) },
    { key: "address", col: "address", value: norm(input.address) },
    { key: "emergencyContactName", col: "emergency_contact_name", value: norm(input.emergencyContactName) },
    { key: "emergencyContactPhone", col: "emergency_contact_phone", value: norm(input.emergencyContactPhone) },
  ].filter((f) => f.value !== undefined);
  if (fields.length === 0) return { ok: true };

  // Read the current values so we only write (and audit) what actually changed.
  const { data: current } = await sb
    .from("people")
    .select("phone,whatsapp,address,emergency_contact_name,emergency_contact_phone")
    .eq("id", me.id)
    .maybeSingle();
  const before = (current ?? {}) as Record<string, string | null>;

  const patch: Record<string, string | null> = {};
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  for (const f of fields) {
    const old = (before[f.col] ?? null) || null;
    const next = (f.value as string | null) ?? null;
    if (old === next) continue;
    patch[f.col] = next;
    changes.push({ field: f.key, oldValue: old, newValue: next });
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await sb.from("people").update(patch).eq("id", me.id);
  if (error) return { ok: false, error: "Could not save your details. Try again." };

  // Append-only audit (best-effort, never blocks the save).
  const { logPersonFieldChanges } = await import("@/lib/person-audit");
  await logPersonFieldChanges(me.id, changes, `portal:${me.name}`);

  revalidatePath("/portal/profile");
  return { ok: true };
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

/** The leads (role "accountable") of a task — now one or more. Reads the
 *  comma-separated "leadIds" field; if absent/empty, falls back to the single
 *  "accountableId" field (back-compat). Returns unique, valid, finite ids. */
function parseLeadIds(formData: FormData): number[] {
  const leads = Array.from(
    new Set(
      String(formData.get("leadIds") ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );
  if (leads.length === 0) {
    const single = Number(formData.get("accountableId"));
    if (Number.isFinite(single) && single > 0) leads.push(single);
  }
  return leads;
}

export async function portalCreateTask(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "manager" && me.portalRole !== "hr") {
    return { error: "Only managers and HR can create tasks." };
  }

  const actionItem = String(formData.get("actionItem") ?? "").trim();
  const companyId = Number(formData.get("companyId"));
  const priority = String(formData.get("priority") ?? "Medium");
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  // Multi-lead: parse the comma-separated leadIds → unique valid ids; fall back
  // to the single accountableId field for back-compat. At least one lead is required.
  const leadIds = parseLeadIds(formData);
  const workingIds = idList(formData, "workingIds").filter((id) => !leadIds.includes(id));
  const instruction = String(formData.get("instruction") ?? "").trim();
  const requiresAttachment = formData.get("requiresAttachment") === "on" || formData.get("requiresAttachment") === "1";
  if (!actionItem) return { error: "Give the task a title." };
  if (!Number.isFinite(companyId)) return { error: "Choose a company." };
  if (leadIds.length === 0) return { error: "Choose who is responsible." };

  let leads: number[];
  let workings: number[];
  if (me.portalRole === "hr") {
    // HR is group-wide: any active person, any company.
    const { data: activeRows } = await sb
      .from("people").select("id").eq("active", true).in("id", [...leadIds, ...workingIds]);
    const activeSet = new Set((activeRows ?? []).map((r) => r.id as number));
    leads = leadIds.filter((id) => activeSet.has(id));
    if (leads.length === 0) return { error: "The responsible person isn't available." };
    workings = workingIds.filter((id) => activeSet.has(id) && !leads.includes(id));
  } else {
    // Managers: themselves + their whole company team (plus cross-company direct
    // reports), within those people's companies.
    const allowedPeople = new Set([me.id, ...(await managerTeamIds(me))]);
    // Every lead must be within reach — reject the whole request otherwise.
    if (!leadIds.every((id) => allowedPeople.has(id))) {
      return { error: "You can only assign to yourself or your team." };
    }
    leads = leadIds;
    workings = workingIds.filter((id) => allowedPeople.has(id) && !leads.includes(id));
    const { data: peopleRows } = await sb.from("people").select("company_id").in("id", [...allowedPeople]);
    const allowedCompanies = new Set((peopleRows ?? []).map((p) => p.company_id as number).filter(Boolean));
    if (!allowedCompanies.has(companyId)) return { error: "You can't create tasks for that company." };
  }

  const { data: company } = await sb.from("companies").select("code,code_prefix").eq("id", companyId).maybeSingle();
  if (!company) return { error: "Company not found." };

  const now = new Date();
  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  const createdBy = `${me.portalRole === "hr" ? "portal-hr" : "portal-mgr"}:${me.name}`;

  const task = await insertTaskWithUniqueCodeSb(companyId, (company.code_prefix as string | null) || (company.code as string), {
    actionItem,
    ownerId: leads[0],
    status: "Not Started",
    priority,
    deadline: deadline && !isNaN(deadline.getTime()) ? deadline : null,
    createdDate: now,
    lastUpdatedAt: now,
    latestUpdate: instruction || null,
    archived: false,
    createdByPersonId: me.id,
    requiresAttachment,
  });

  // Assignees: every lead is "accountable", every working person is "working".
  const rows = [
    ...leads.map((id) => ({ task_id: task.id, person_id: id, role: "accountable" })),
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
  const recipients = [...leads, ...workings].filter((id) => id !== me.id).map(personRecipient);
  recipients.push("admin");
  await notifyMany(recipients, {
    kind: "assigned",
    taskId: task.id,
    taskCode: task.code,
    title: `${me.name} assigned you a task`,
    body: actionItem,
    actor: me.name,
  });

  void reindexEntity("task", task.id); // new task — index it (best-effort)
  revalidatePath("/portal");
  revalidatePath("/portal/tasks");
  revalidatePath("/");
  // Don't redirect — the quick-add form shows a "notify {assignee}?" step on success.
  return null;
}

/* ----------------------------------------------------------------------
 * Director messaging — draft a reminder/message to any person. Creates an
 * Outbox draft (owner-visible, audit-tagged) and returns a one-tap deep-link
 * to send via WhatsApp/Email/SMS. Default recipient = a task's assignee when a
 * taskCode is given; otherwise the chosen person. Honours a kill switch.
 * ---------------------------------------------------------------------- */
export async function portalDirectorDraftMessage(input: {
  personId: number;
  channel?: "WHATSAPP" | "EMAIL" | "SMS";
  subject?: string | null;
  body: string;
  taskCode?: string | null;
}): Promise<{ ok: true; link: string | null; contactMissing: boolean; channel: "WHATSAPP" | "EMAIL" | "SMS" } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") return { ok: false, error: "Only directors can do this." };

  // Soft kill switch (owner can pause all director outreach from Settings).
  const { data: killRow } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  if ((killRow?.value as string | null) === "1") return { ok: false, error: "Director outreach is paused by the administrator." };

  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Write a message." };

  const { data: person } = await sb
    .from("people")
    .select("id,name,email,phone,whatsapp,preferred_channel,company_id")
    .eq("id", input.personId)
    .maybeSingle();
  if (!person) return { ok: false, error: "Recipient not found." };

  const { pickChannel, contactForChannel, linkFor } = await import("@/lib/outbox/links");
  const contact = {
    email: (person.email as string | null) ?? null,
    phone: (person.phone as string | null) ?? null,
    whatsapp: (person.whatsapp as string | null) ?? null,
    preferredChannel: (person.preferred_channel as string | null) ?? null,
  };
  const channel = input.channel ?? pickChannel(contact);
  const to = contactForChannel(contact, channel);
  const subject = input.subject?.trim() || "A note from the director";
  const link = linkFor(channel, to, subject, body);

  let companyName: string | null = null;
  if (person.company_id) {
    const { data: c } = await sb.from("companies").select("name").eq("id", person.company_id).maybeSingle();
    companyName = (c?.name as string | null) ?? null;
  }

  const { error } = await sb.from("outbox").insert({
    channel,
    recipient_name: person.name as string,
    recipient_contact: to,
    company: companyName,
    subject: channel === "EMAIL" ? subject : null,
    body,
    message_type: input.taskCode ? "DIRECTOR REMINDER" : "DIRECTOR MESSAGE",
    status: "Draft",
    source: `portal-dir:${me.name}`,
    person_id: person.id,
    created_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  await recordEvent("portal.director.message", "ok", { by: me.name, to: person.name, channel, task: input.taskCode ?? null });
  revalidatePath("/outbox");
  return { ok: true, link, contactMissing: !to, channel };
}

/** Auto-title for an ad-hoc group from recipient first names — editable later
 *  in chat (e.g. "Ravi & Asha", "Ravi, Asha & 2 others"). */
function autoGroupTitle(firstNames: string[]): string {
  const names = firstNames.filter(Boolean);
  if (names.length === 0) return "Group";
  if (names.length <= 2) return names.join(" & ");
  const rest = names.length - 2;
  return `${names.slice(0, 2).join(", ")} & ${rest} other${rest === 1 ? "" : "s"}`;
}

/**
 * Director: message one or more people through the built-in CHAT.
 * - One recipient  → continues (or opens) the 1:1 DM with that person.
 * - Many recipients → creates an ad-hoc group (auto-named, renameable in chat).
 * Returns the threadId so the client can jump straight into the conversation.
 * Internal messaging, so it is NOT gated by the external outreach pause.
 */
export async function portalDirectorChatMessage(input: {
  personIds: number[];
  body: string;
  title?: string | null;
}): Promise<{ ok: true; threadId: number; group: boolean } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") return { ok: false, error: "Only directors can do this." };

  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Write a message." };

  const ids = [...new Set(input.personIds.filter((n) => Number.isFinite(n) && n > 0 && n !== me.id))];
  if (ids.length === 0) return { ok: false, error: "Choose at least one recipient." };

  const mine = personParticipant(me.id);
  let threadId: number;
  const group = ids.length > 1;
  if (!group) {
    threadId = await getOrCreateDm(mine, personParticipant(ids[0]), mine);
  } else {
    const { data: names } = await sb.from("people").select("id,name").in("id", ids);
    const order = new Map(ids.map((id, i) => [id, i]));
    const firstNames = (names ?? [])
      .sort((a, b) => (order.get(a.id as number) ?? 0) - (order.get(b.id as number) ?? 0))
      .map((r) => (r.name as string).split(/\s+/)[0]);
    const title = input.title?.trim() || autoGroupTitle(firstNames);
    threadId = await createGroup({ title, createdBy: mine, participants: ids.map(personParticipant) });
  }

  await sendMessage({ threadId, sender: mine, body });
  await recordEvent("portal.director.chat", "ok", { by: me.name, recipients: ids.length, group });
  revalidatePath("/portal/chat");
  return { ok: true, threadId, group };
}

/**
 * Management (director / HR / manager): open the task's GROUP chat and drop a
 * short nudge into it. Reuses threadFromTask (deduped per task, seeds owner +
 * assignees + the admin owner), so everyone working the task can pick it up.
 * Re-checks the task is in the sender's view — staff get an error. Returns the
 * threadId so the client can jump straight into /portal/chat/{threadId}.
 */
export async function portalMessageTaskGroup(
  taskId: number
): Promise<{ ok: true; threadId: number } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole === "staff") return { ok: false, error: "You don't have permission to do this." };
  if (!(await personCanSeeTask(me, taskId))) return { ok: false, error: "That task isn't in your view." };

  const { data: t } = await sb.from("tasks").select("code,action_item").eq("id", taskId).maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };
  const code = t.code as string;
  const title = (t.action_item as string | null)?.trim();

  // The sender (createdBy) is added as a participant by threadFromTask, so the
  // group thread also appears in the sender's own chat list.
  const createdBy = personParticipant(me.id);
  const threadId = await threadFromTask(taskId, code, createdBy);
  await sendMessage({
    threadId,
    sender: createdBy,
    body: `🔔 Reminder on *${code}*${title ? ` — "${title}"` : ""}. Please share an update when you can. Thank you.`,
    taskCode: code,
  });

  await recordEvent("portal.task.chat", "ok", { by: me.name, role: me.portalRole, task: code });
  revalidatePath("/portal/chat");
  return { ok: true, threadId };
}

/**
 * Open (or continue) a one-to-one chat DM with a person — used by the per-person
 * "message in chat" action on a task. Returns the threadId so the client jumps to
 * /portal/chat/{threadId}. Chat is everyone↔everyone, so any signed-in portal
 * person may DM a colleague (the existing DM is reused, never duplicated).
 */
export async function portalOpenDm(
  personId: number
): Promise<{ ok: true; threadId: number } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (!Number.isFinite(personId) || personId <= 0) return { ok: false, error: "Unknown person." };
  if (personId === me.id) return { ok: false, error: "You can't message yourself." };
  const mine = personParticipant(me.id);
  const threadId = await getOrCreateDm(mine, personParticipant(personId), mine);
  revalidatePath("/portal/chat");
  return { ok: true, threadId };
}

/**
 * Director: one EMAIL to several people at once (all addresses in the To field).
 * Builds a single mailto: deep-link for a one-tap manual send and logs one
 * owner-visible Outbox record. Honours the external outreach pause.
 */
export async function portalDirectorGroupEmail(input: {
  personIds: number[];
  subject?: string | null;
  body: string;
}): Promise<{ ok: true; link: string | null; missing: string[] } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") return { ok: false, error: "Only directors can do this." };

  const { data: killRow } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  if ((killRow?.value as string | null) === "1") return { ok: false, error: "Director outreach is paused by the administrator." };

  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Write a message." };

  const ids = [...new Set(input.personIds.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return { ok: false, error: "Choose at least one recipient." };

  const { data: people } = await sb.from("people").select("id,name,email").in("id", ids);
  const rows = people ?? [];
  const withEmail = rows.filter((p) => (p.email as string | null)?.trim());
  const missing = rows.filter((p) => !(p.email as string | null)?.trim()).map((p) => p.name as string);
  if (withEmail.length === 0) return { ok: false, error: "None of the chosen people have an email on file." };

  const emails = withEmail.map((p) => (p.email as string).trim());
  const subject = input.subject?.trim() || "A note from the director";
  // mailto supports comma-separated recipients; build directly so the commas
  // stay literal (encodeURIComponent would turn them into %2C and break the list).
  const link = `mailto:${emails.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const { error } = await sb.from("outbox").insert({
    channel: "EMAIL",
    recipient_name: withEmail.map((p) => p.name as string).join(", "),
    recipient_contact: emails.join(", "),
    company: null,
    subject,
    body,
    message_type: "DIRECTOR MESSAGE",
    status: "Draft",
    source: `portal-dir:${me.name}`,
    person_id: withEmail.length === 1 ? (withEmail[0].id as number) : null,
    created_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  await recordEvent("portal.director.message", "ok", { by: me.name, channel: "EMAIL", recipients: withEmail.length });
  revalidatePath("/outbox");
  return { ok: true, link, missing };
}

/**
 * Portal: send a person their branded task-reminder email (the same engine the
 * admin Outbox uses) with an optional personal note. Director / Manager / Admin
 * only. Signs off from the sender's office (Director's / Manager's / Admin's) with
 * their name. Honours the owner's outreach pause. Logs to the admin sent log.
 */
export async function portalSendReminderEmail(
  personId: number,
  taskId?: number,
  note?: string,
): Promise<{ ok: boolean; reason?: "no-email" | "no-tasks" | "not-configured" | "not-found" | "error"; error?: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, reason: "error", error: "Please sign in again." };
  const role = me.portalRole;
  if (role !== "director" && role !== "manager" && role !== "hr") {
    return { ok: false, reason: "error", error: "Only managers, Admin and directors can send reminders." };
  }

  // Owner kill switch (pauses all portal outreach).
  const { data: killRow } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  if ((killRow?.value as string | null) === "1") {
    return { ok: false, reason: "error", error: "Outreach is paused by the administrator." };
  }

  // Team-scope guard (ACTPORTAL-02): managers may only remind themselves or a
  // direct report; director/HR stay group-wide. Same scope as everywhere else.
  if (!(await personCanSeePerson(me, personId))) {
    return { ok: false, reason: "error", error: "That person isn't on your team." };
  }

  const office = role === "director" ? "director" : role === "manager" ? "manager" : "admin";
  const tag = role === "director" ? "dir" : role === "manager" ? "mgr" : "admin";
  const { sendTaskReminderEmail } = await import("@/lib/reminders");
  const res = await sendTaskReminderEmail({
    personId,
    taskId,
    note,
    // Reply-To = the sender's own email so a staff reply reaches them, not admin.
    // fromAddress = the same address so the mail genuinely comes FROM them — this
    // takes effect on Resend (DNS-verified oracle.co.tz) and is safely ignored on
    // Gmail SMTP, where Google forces the authenticated admin address.
    sender: {
      office,
      name: me.name,
      replyTo: me.email,
      fromAddress: me.email,
      sourceTag: `portal-${tag}:${me.name}`,
    },
  });
  if (res.ok) {
    await recordEvent("portal.reminder.email", "ok", { by: me.name, role, personId });
    revalidatePath("/outbox");
    revalidatePath("/portal/team");
  }
  return res;
}

/**
 * Portal: send a person their rich WhatsApp task reminder via Twilio (formatted
 * card + generated summary image). Director / Manager / Admin only; honours the
 * outreach pause. Returns `not-configured` so the caller can fall back to the
 * manual wa.me deep-link when Twilio isn't set up.
 */
export async function portalSendReminderWhatsApp(
  personId: number,
): Promise<{ ok: boolean; reason?: "no-email" | "no-tasks" | "not-configured" | "not-found" | "error"; error?: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, reason: "error", error: "Please sign in again." };
  const role = me.portalRole;
  if (role !== "director" && role !== "manager" && role !== "hr") {
    return { ok: false, reason: "error", error: "Only managers, Admin and directors can send reminders." };
  }

  const { data: killRow } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  if ((killRow?.value as string | null) === "1") {
    return { ok: false, reason: "error", error: "Outreach is paused by the administrator." };
  }

  // Team-scope guard (ACTPORTAL-02): managers may only remind themselves or a
  // direct report; director/HR stay group-wide.
  if (!(await personCanSeePerson(me, personId))) {
    return { ok: false, reason: "error", error: "That person isn't on your team." };
  }

  const tag = role === "director" ? "dir" : role === "manager" ? "mgr" : "admin";
  const { sendTaskReminderWhatsApp } = await import("@/lib/reminders");
  const { waFromLabel } = await import("@/lib/wa-card");
  const res = await sendTaskReminderWhatsApp({
    personId,
    sourceTag: `portal-${tag}:${me.name}`,
    from: waFromLabel({ name: me.name, role }),
  });
  if (res.ok) {
    await recordEvent("portal.reminder.whatsapp", "ok", { by: me.name, role, personId });
    revalidatePath("/outbox");
    revalidatePath("/portal/team");
  }
  return res;
}

/**
 * Management: build a DETAILED WhatsApp summary of a person's open tasks (status,
 * priority, deadline, overdue time, responsible, description, latest update) and
 * return a wa.me deep-link the sender taps to send. Logs an Outbox draft so it's
 * owner-visible. Director / Manager / Admin only; honours the outreach pause.
 */
export async function portalSendTaskSummaryWhatsApp(
  personId: number,
  taskId?: number,
): Promise<{ ok: true; name: string; waHref: string | null; missing: boolean } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Please sign in again." };
  const role = me.portalRole;
  if (role !== "director" && role !== "manager" && role !== "hr") {
    return { ok: false, error: "Only managers, Admin and directors can send reminders." };
  }

  const { data: killRow } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  if ((killRow?.value as string | null) === "1") return { ok: false, error: "Outreach is paused by the administrator." };

  // Team-scope guard (ACTPORTAL-01): a manager may only summarise themselves or a
  // direct report — never read another person's number/tasks across the group.
  // Director/HR stay group-wide. Mirrors personCanSeePerson everywhere else.
  if (!(await personCanSeePerson(me, personId))) return { ok: false, error: "That person isn't on your team." };

  const { data: person } = await sb.from("people").select("id,name,whatsapp,phone,company_id").eq("id", personId).maybeSingle();
  if (!person) return { ok: false, error: "Person not found." };

  const { getAllTasks } = await import("@/lib/queries");
  const { isOpen } = await import("@/lib/derive");
  let rows = (await getAllTasks()).filter((t) => isOpen(t.status) && t.assigneeIds.includes(personId));
  // Per-task scope: when a taskId is supplied, remind about that ONE task only.
  if (taskId != null) rows = rows.filter((t) => t.id === taskId);
  if (rows.length === 0) {
    return { ok: false, error: taskId != null ? "That task isn't open for this person." : "No open tasks to summarise." };
  }

  const { buildPortalTaskReminder } = await import("@/lib/outbox/gen");
  const { waLink } = await import("@/lib/outbox/links");
  const { appBaseUrl } = await import("@/lib/app-url");
  // Sender sign-off, e.g. "Mr Pulin - Director" (greeting name carries accountability).
  const roleLabel = role === "director" ? "Director" : role === "manager" ? "Manager" : "Admin";
  const from = me.name ? `${me.name} - ${roleLabel}` : roleLabel;
  // Link straight to the recipient's signed-in portal — the ONE task for a single-task
  // reminder (opens that task directly), or their task list for a multi-task nudge.
  // No public preview-card link.
  const base = appBaseUrl();
  const link = taskId != null && rows.length === 1
    ? `${base}/portal/task/${rows[0].code}`
    : `${base}/portal`;
  const text = buildPortalTaskReminder(person.name as string, rows, link, from);
  const number = (((person.whatsapp as string | null) || (person.phone as string | null)) ?? "").trim();
  const waHref = waLink(number, text);

  // No Outbox draft is stored — the Outbox is generated live per person, and a
  // send simply opens WhatsApp. We only log the event for the activity trail.
  await recordEvent("portal.task.summary", "ok", { by: me.name, role, to: person.name, count: rows.length });
  revalidatePath("/outbox");
  return { ok: true, name: person.name as string, waHref, missing: !number };
}

/** Director: schedule a calendar event / meeting (any company). Reuses the
 *  calendar engine (attendees, .ics invites, reminders, recurrence). */
type PortalEventResult =
  | { ok: true; id?: number; meetLink?: string | null; sentCount?: number; sentVia?: "google" | "email"; sendNote?: string }
  | { ok: false; error: string };

/** Enrich the picker's `[{personId, name}]` attendees with each person's email
 *  (so Google can deliver native invites). People with no email are kept but
 *  simply won't receive an invite — same as the admin calendar. */
async function enrichAttendeeEmails(formData: FormData): Promise<void> {
  let picked: Array<{ personId?: number; name?: string; email?: string }>;
  try {
    picked = JSON.parse(String(formData.get("attendees") ?? "[]"));
  } catch {
    return;
  }
  if (!Array.isArray(picked) || picked.length === 0) return;
  const ids = picked.map((a) => a.personId).filter((x): x is number => typeof x === "number");
  if (ids.length === 0) return;
  const { data } = await sb.from("people").select("id,email").in("id", ids);
  const emailById = new Map((data ?? []).map((r) => [r.id as number, (r.email as string | null) ?? undefined]));
  formData.set(
    "attendees",
    JSON.stringify(picked.map((a) => ({ ...a, email: a.email || (a.personId != null ? emailById.get(a.personId) : undefined) })))
  );
}

/** Shared create-then-auto-send for the portal event sheet (director + manager).
 *  Creates the event, then mints the Google Meet link + sends invites to every
 *  attendee with an email — unless the owner has paused director/manager
 *  outreach. Falls back to the .ics email path when Google isn't connected. */
async function portalCreateAndSendEvent(formData: FormData, createdBy: string): Promise<PortalEventResult> {
  await enrichAttendeeEmails(formData);
  const res = await createEventAction(formData, createdBy);
  if (!res.ok || !res.id) return res;

  // Honour the global kill switch — if outreach is paused, the event is still
  // created (and shows on calendars), but no invite is auto-sent.
  const { data: killRow } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  const paused = killRow?.value === "true" || killRow?.value === true;
  if (paused) {
    return { ok: true, id: res.id, sendNote: "Event created. Invites are paused by the owner — send them from the calendar when ready." };
  }

  const send = await sendEventInviteAction(res.id);
  if (send.ok) {
    return { ok: true, id: res.id, meetLink: send.meetLink ?? null, sentCount: send.count, sentVia: send.via };
  }
  // The event exists; only the invite couldn't go out (e.g. no attendee emails,
  // email provider off). Surface a gentle note rather than failing the create.
  return { ok: true, id: res.id, sendNote: send.error };
}

export async function portalDirectorCreateEvent(formData: FormData): Promise<PortalEventResult> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") return { ok: false, error: "Only directors can do this." };
  const res = await portalCreateAndSendEvent(formData, `portal-dir:${me.name}`);
  if (res.ok) revalidatePath("/portal/board");
  return res;
}

/** Managers schedule meetings group-wide (same reach as directors), with the
 *  same auto-send Google Meet behaviour. */
export async function portalManagerCreateEvent(formData: FormData): Promise<PortalEventResult> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "manager") return { ok: false, error: "Only managers can do this." };
  const res = await portalCreateAndSendEvent(formData, `portal-mgr:${me.name}`);
  if (res.ok) revalidatePath("/portal");
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
  const priority = String(formData.get("priority") ?? "Medium");
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  // Multi-lead: parse the comma-separated leadIds → unique valid ids; fall back
  // to the single accountableId field for back-compat. At least one lead is required.
  const leadIds = parseLeadIds(formData);
  const workingIds = idList(formData, "workingIds").filter((id) => !leadIds.includes(id));
  const instruction = String(formData.get("instruction") ?? "").trim();
  const requiresAttachment = formData.get("requiresAttachment") === "on" || formData.get("requiresAttachment") === "1";
  // The director composer defaults this ON — only the creator may close the task.
  const creatorCloseOnly = formData.get("creatorCloseOnly") === "on" || formData.get("creatorCloseOnly") === "1";
  if (!actionItem) return { error: "Give the task a title." };
  if (leadIds.length === 0) return { error: "Choose who is responsible." };

  // Multi-company fan-out: parse the comma-separated companyIds → unique valid
  // ids; fall back to a single companyId field if companyIds is absent/empty.
  const companyIds = Array.from(
    new Set(
      String(formData.get("companyIds") ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );
  if (companyIds.length === 0) {
    const single = Number(formData.get("companyId"));
    if (Number.isFinite(single) && single > 0) companyIds.push(single);
  }
  if (companyIds.length === 0) return { error: "Choose a company." };

  // Group-wide: the only constraint is that the people are real + active.
  const { data: activeRows } = await sb.from("people").select("id").eq("active", true).in("id", [...leadIds, ...workingIds]);
  const activeSet = new Set((activeRows ?? []).map((r) => r.id as number));
  const leads = leadIds.filter((id) => activeSet.has(id));
  if (leads.length === 0) return { error: "The responsible person isn't available." };
  const workings = workingIds.filter((id) => activeSet.has(id) && !leads.includes(id));

  const now = new Date();
  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  const createdBy = `portal-dir:${me.name}`;

  // Create one task per selected company.
  for (const companyId of companyIds) {
    const { data: company } = await sb.from("companies").select("code,code_prefix").eq("id", companyId).maybeSingle();
    if (!company) continue; // skip an unknown company id rather than fail the whole fan-out

    const task = await insertTaskWithUniqueCodeSb(companyId, (company.code_prefix as string | null) || (company.code as string), {
      actionItem, ownerId: leads[0], status: "Not Started", priority,
      deadline: deadline && !isNaN(deadline.getTime()) ? deadline : null,
      createdDate: now, lastUpdatedAt: now, latestUpdate: instruction || null, archived: false,
      createdByPersonId: me.id,
      requiresAttachment,
    });

    // insertTaskWithUniqueCodeSb doesn't carry creator_close_only — stamp it after.
    if (creatorCloseOnly) {
      await sb.from("tasks").update({ creator_close_only: true }).eq("id", task.id);
    }

    const rows = [
      ...leads.map((id) => ({ task_id: task.id, person_id: id, role: "accountable" })),
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

    const recipients = [...leads, ...workings].map(personRecipient);
    recipients.push("admin");
    await notifyMany(recipients, {
      kind: "assigned", taskId: task.id, taskCode: task.code,
      title: `${me.name} assigned you a task`, body: actionItem, actor: me.name,
    });

    void reindexEntity("task", task.id); // new task — index it (best-effort)
  }

  revalidatePath("/portal/board");
  revalidatePath("/portal/tasks");
  revalidatePath("/");
  // Don't redirect — the form shows a "notify {assignee}?" step on success, so it
  // must stay mounted. (Redirecting here unmounted it and broke that step.)
  return null;
}

/* ----------------------------------------------------------------------
 * Management (director / HR / manager) — edit a task inline: status, priority,
 * deadline, reassign the responsible person. Role-aware + scoped server-side:
 *   • director / HR  → group-wide; may edit any field.
 *   • manager        → only tasks in their view; status moves only (their
 *                       allowed set), and never on a Completed/Closed task.
 * Every change is audit-logged + stamped by role. Never trusts the form.
 * ---------------------------------------------------------------------- */
const ALL_STATUSES = [
  "Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed",
];
// The non-terminal statuses (everything except Completed/Closed). Used to keep
// "move an open task between open statuses" separate from the gated completion.
const OPEN_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
const ALL_PRIORITIES = ["Critical", "High", "Medium", "Low"];

function roleTag(role: string): string {
  return role === "director" ? "dir" : role === "hr" ? "hr" : "mgr";
}

export async function portalEditTask(input: {
  taskId: number;
  status?: string;
  priority?: string;
  deadline?: string | null; // "yyyy-mm-dd" to set, "" to clear, undefined to leave
  accountableId?: number;
  actionItem?: string; // task title — management may edit after creation
  description?: string | null; // task description (tasks.comments); "" clears
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const role = me.portalRole;
  if (role === "staff") return { ok: false, error: "You don't have permission to edit tasks." };
  if (!(await personCanSeeTask(me, input.taskId))) return { ok: false, error: "That task isn't in your view." };

  const { data: t } = await sb
    .from("tasks")
    .select("id,code,company_id,status,priority,deadline,owner_id,closed_date,created_by_person_id,creator_close_only,action_item,comments")
    .eq("id", input.taskId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };

  // Unified permission (task-permissions.ts): directors/HR may edit + complete any
  // task; everyone else only a task they created. Replaces the old `full` +
  // ad-hoc creator_close_only checks so every surface obeys one rule.
  const canManage = canManageTask(
    { id: me.id, portalRole: role },
    { createdByPersonId: (t.created_by_person_id as number | null) ?? null },
  );

  const createdBy = `portal-${roleTag(role)}:${me.name}`;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { last_updated_at: now };
  const current = t.status as string;
  const lockedDone = current === "Completed" || current === "Closed";

  if (input.status && input.status !== current) {
    const goingTerminal = isClosedStatus(input.status);
    if (goingTerminal) {
      // Completing / closing — only a director/HR or the task's creator.
      if (!canManage) return { ok: false, error: "Only the task's creator or a director can complete this." };
      patch.status = input.status;
      patch.closed_date = computeClosedDate(input.status, (t.closed_date as string | null) ?? null, now);
      await logChangeSb(t.id as number, t.code as string, t.company_id as number, "status", current, input.status, `Edited from portal (${role})`, createdBy);
    } else {
      // Open-status move. Reopening a finished task needs manage rights; routine
      // open→open moves are allowed for any manager in view (their limited set),
      // and the full open set for those who can manage the task.
      const allowedOpen = canManage ? OPEN_STATUSES : STAFF_STATUSES;
      const reopening = lockedDone;
      if ((!reopening || canManage) && allowedOpen.includes(input.status)) {
        patch.status = input.status;
        patch.closed_date = computeClosedDate(input.status, (t.closed_date as string | null) ?? null, now);
        await logChangeSb(t.id as number, t.code as string, t.company_id as number, "status", current, input.status, `Edited from portal (${role})`, createdBy);
      }
    }
  }
  if (canManage && input.priority && ALL_PRIORITIES.includes(input.priority) && input.priority !== t.priority) {
    patch.priority = input.priority;
    await logChangeSb(t.id as number, t.code as string, t.company_id as number, "priority", t.priority as string, input.priority, `Edited from portal (${role})`, createdBy);
  }
  if (canManage && input.deadline !== undefined) {
    const newIso = input.deadline ? new Date(input.deadline).toISOString() : null;
    const oldIso = t.deadline ? new Date(t.deadline as string).toISOString() : null;
    if (newIso !== oldIso) {
      patch.deadline = newIso;
      await logChangeSb(t.id as number, t.code as string, t.company_id as number, "deadline", oldIso, newIso, `Edited from portal (${role})`, createdBy);
    }
  }
  let reassigned: number | null = null;
  if (canManage && input.accountableId && input.accountableId !== (t.owner_id as number | null)) {
    const { data: p } = await sb.from("people").select("id,name,active").eq("id", input.accountableId).maybeSingle();
    if (!p || !p.active) return { ok: false, error: "That person isn't available." };
    patch.owner_id = input.accountableId;
    await sb.from("task_assignees").delete().eq("task_id", t.id as number).eq("role", "accountable");
    await sb.from("task_assignees").upsert(
      { task_id: t.id as number, person_id: input.accountableId, role: "accountable" },
      { onConflict: "task_id,person_id" }
    );
    reassigned = input.accountableId;
    await logChangeSb(t.id as number, t.code as string, t.company_id as number, "owner", String(t.owner_id ?? "—"), p.name as string, `Reassigned from portal (${role})`, createdBy);
  }

  // Title + description — only those who may manage the task (director/HR or the
  // creator). Empty title is rejected; description clears on "".
  if (canManage && input.actionItem !== undefined) {
    const next = input.actionItem.trim();
    if (!next) return { ok: false, error: "A task needs a title." };
    if (next !== (t.action_item as string)) {
      patch.action_item = next;
      await logChangeSb(t.id as number, t.code as string, t.company_id as number, "action_item", t.action_item as string, next, `Edited from portal (${role})`, createdBy);
    }
  }
  if (canManage && input.description !== undefined) {
    const next = input.description?.trim() || null;
    if (next !== ((t.comments as string | null) || null)) {
      patch.comments = next;
      await logChangeSb(t.id as number, t.code as string, t.company_id as number, "comments", (t.comments as string | null) ?? null, next, `Edited from portal (${role})`, createdBy);
    }
  }

  const { error } = await sb.from("tasks").update(patch).eq("id", t.id as number);
  if (error) return { ok: false, error: error.message };

  void reindexEntity("task", t.id as number); // status/lifecycle may have moved (best-effort)

  if (reassigned) {
    await notifyMany([personRecipient(reassigned), "admin"], {
      kind: "assigned", taskId: t.id as number, taskCode: t.code as string,
      title: `${me.name} made you responsible`, body: "You're now responsible for this task.", actor: me.name,
    });
  }

  revalidatePath("/portal/board");
  revalidatePath("/portal/tasks");
  revalidatePath(`/task/${t.code}`);
  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Set a task's LEAD set (role "accountable") — now one or more people.
 *   • owner_id := leadIds[0] (back-compat: the first lead).
 *   • every given person becomes "accountable" (added to the task if not
 *     already on it); any existing "accountable" person NOT in leadIds is
 *     demoted to "working"; nobody is ever removed from the task.
 *   • director / HR  → group-wide; manager → limited to their team.
 * Audit-logged + notifies the newly-added leads.
 * ---------------------------------------------------------------------- */
export async function portalSetTaskLeads(
  taskId: number,
  leadIds: number[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const role = me.portalRole;
  if (role === "staff") return { ok: false, error: "You don't have permission to edit tasks." };
  if (!(await personCanSeeTask(me, taskId))) return { ok: false, error: "That task isn't in your view." };

  // Unique, valid lead ids — at least one is required.
  const wanted = Array.from(new Set(leadIds.filter((n) => Number.isFinite(n) && n > 0)));
  if (wanted.length === 0) return { ok: false, error: "Choose at least one person to be responsible." };

  const { data: t } = await sb
    .from("tasks")
    .select("id,code,company_id,owner_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };

  // Every lead must be a real, active person within the editor's reach.
  const { data: people } = await sb
    .from("people").select("id,name,active").in("id", wanted);
  const peopleById = new Map((people ?? []).map((p) => [p.id as number, p]));
  for (const id of wanted) {
    const p = peopleById.get(id);
    if (!p || p.active !== true) return { ok: false, error: "That person isn't available." };
  }
  if (role === "manager") {
    const allowed = new Set([me.id, ...(await managerTeamIds(me))]);
    if (!wanted.every((id) => allowed.has(id))) {
      return { ok: false, error: "You can only assign to yourself or your team." };
    }
  }

  const createdBy = `portal-${roleTag(role)}:${me.name}`;
  const now = new Date().toISOString();

  // Existing assignees, so we know who is already on the task (don't re-add) and
  // which current leads must be demoted.
  const { data: existing } = await sb
    .from("task_assignees").select("person_id,role").eq("task_id", taskId);
  const onTask = new Set((existing ?? []).map((a) => a.person_id as number));
  const currentLeads = (existing ?? []).filter((a) => a.role === "accountable").map((a) => a.person_id as number);

  // Demote any current lead that is no longer wanted → "working".
  const demote = currentLeads.filter((id) => !wanted.includes(id));
  if (demote.length > 0) {
    await sb.from("task_assignees")
      .update({ role: "working" })
      .eq("task_id", taskId)
      .in("person_id", demote);
  }

  // Promote/insert the wanted leads → "accountable" (added to the task if new).
  await sb.from("task_assignees").upsert(
    wanted.map((id) => ({ task_id: taskId, person_id: id, role: "accountable" })),
    { onConflict: "task_id,person_id" }
  );

  // owner_id := the first lead (back-compat for board owner / reminders / close-lock).
  const oldOwner = (t.owner_id as number | null) ?? null;
  const newOwner = wanted[0];
  if (newOwner !== oldOwner) {
    const { error } = await sb.from("tasks").update({ owner_id: newOwner, last_updated_at: now }).eq("id", taskId);
    if (error) return { ok: false, error: error.message };
  } else {
    await sb.from("tasks").update({ last_updated_at: now }).eq("id", taskId);
  }

  const leadNames = wanted.map((id) => (peopleById.get(id)?.name as string | undefined) ?? String(id));
  await logChangeSb(
    t.id as number, t.code as string, t.company_id as number,
    "owner", String(oldOwner ?? "—"), leadNames.join(", "),
    `Leads set from portal (${role})`, createdBy
  );

  void reindexEntity("task", t.id as number); // owner/assignees moved (best-effort)

  // Notify only the newly-added leads (people not previously on the task).
  const added = wanted.filter((id) => !onTask.has(id) && id !== me.id);
  if (added.length > 0) {
    await notifyMany([...added.map(personRecipient), "admin"], {
      kind: "assigned", taskId: t.id as number, taskCode: t.code as string,
      title: `${me.name} made you responsible`, body: "You're now responsible for this task.", actor: me.name,
    });
  }

  revalidatePath("/portal/board");
  revalidatePath("/portal/tasks");
  revalidatePath(`/task/${t.code}`);
  return { ok: true };
}

/** Management one-tap reminder: resolves the responsible person and drafts a
 *  message (Outbox) + returns a deep-link. Director/HR group-wide; managers only
 *  for tasks in their view. Honours the owner's outreach pause. */
export async function portalRemindTask(
  taskId: number
): Promise<{ ok: true; link: string | null; contactMissing: boolean; name: string } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const role = me.portalRole;
  if (role === "staff") return { ok: false, error: "You don't have permission to do this." };
  if (!(await personCanSeeTask(me, taskId))) return { ok: false, error: "That task isn't in your view." };

  const { data: killRow } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  if ((killRow?.value as string | null) === "1") return { ok: false, error: "Outreach is paused by the administrator." };

  const { data: t } = await sb.from("tasks").select("id,code,action_item,owner_id,company_id").eq("id", taskId).maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };
  const { data: co } = await sb.from("companies").select("name").eq("id", t.company_id as number).maybeSingle();
  const companyName = (co?.name as string | null) ?? "";
  let personId = (t.owner_id as number | null) ?? null;
  if (!personId) {
    const { data: a } = await sb.from("task_assignees").select("person_id").eq("task_id", taskId).eq("role", "accountable").maybeSingle();
    personId = (a?.person_id as number | null) ?? null;
  }
  if (!personId) return { ok: false, error: "No one is responsible for this task yet." };

  const { data: person } = await sb
    .from("people")
    .select("id,name,email,phone,whatsapp,preferred_channel,company_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { ok: false, error: "Recipient not found." };

  const name = person.name as string;

  const { buildPortalTaskReminder } = await import("@/lib/outbox/gen");
  const { pickChannel, contactForChannel, linkFor } = await import("@/lib/outbox/links");
  const { appBaseUrl } = await import("@/lib/app-url");
  const roleLabel = role === "director" ? "Director" : role === "manager" ? "Manager" : "Admin";
  const from = me.name ? `${me.name} - ${roleLabel}` : roleLabel;
  // Direct portal link — opens the task in the recipient's signed-in portal.
  const portalLink = `${appBaseUrl()}/portal/task/${t.code}`;
  const body = buildPortalTaskReminder(
    name,
    [{ companyName, actionItem: t.action_item as string }],
    portalLink,
    from,
  );

  const contact = {
    email: (person.email as string | null) ?? null,
    phone: (person.phone as string | null) ?? null,
    whatsapp: (person.whatsapp as string | null) ?? null,
    preferredChannel: (person.preferred_channel as string | null) ?? null,
  };
  const channel = pickChannel(contact);
  const to = contactForChannel(contact, channel);
  const subject = "Task Reminder - Oracle Consultancy Limited";
  const link = linkFor(channel, to, subject, body);

  // No Outbox draft stored — a per-task reminder simply opens WhatsApp/email via
  // the returned link. We only log the event for the activity trail.
  await recordEvent("portal.reminder.draft", "ok", { by: me.name, role, to: name, channel, task: t.code });
  return { ok: true, link, contactMissing: !to, name };
}

/** Management: remind EVERYONE involved in a task (accountable + working
 *  assignees, and owner). Drafts one Outbox message per person. Director/HR
 *  group-wide; managers only for tasks in their view. Honours the kill switch. */
export async function portalRemindTaskAll(
  taskId: number
): Promise<{ ok: true; count: number; names: string[]; skipped: number } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const role = me.portalRole;
  if (role === "staff") return { ok: false, error: "You don't have permission to do this." };
  if (!(await personCanSeeTask(me, taskId))) return { ok: false, error: "That task isn't in your view." };

  const { data: killRow } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  if ((killRow?.value as string | null) === "1") return { ok: false, error: "Outreach is paused by the administrator." };

  const { data: t } = await sb.from("tasks").select("id,code,action_item,owner_id").eq("id", taskId).maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };

  const { data: assignees } = await sb.from("task_assignees").select("person_id").eq("task_id", taskId);
  const ids = new Set<number>();
  if (t.owner_id) ids.add(t.owner_id as number);
  for (const a of assignees ?? []) if (a.person_id) ids.add(a.person_id as number);
  ids.delete(me.id); // don't remind yourself
  if (ids.size === 0) return { ok: false, error: "No one is assigned to this task yet." };

  const { data: people } = await sb
    .from("people")
    .select("id,name,email,phone,whatsapp,preferred_channel,company_id,active")
    .in("id", [...ids]);

  const { pickChannel, contactForChannel, linkFor } = await import("@/lib/outbox/links");
  const now = new Date().toISOString();
  const tag = `portal-${roleTag(role)}:${me.name}`;
  const names: string[] = [];
  let skipped = 0;

  for (const person of people ?? []) {
    if (person.active === false) { skipped++; continue; }
    const name = person.name as string;
    const first = name.split(" ")[0];
    const body = `Hi ${first}, a reminder on "${t.action_item}" (${t.code}) — please update when you can. Thank you.`;
    const contact = {
      email: (person.email as string | null) ?? null,
      phone: (person.phone as string | null) ?? null,
      whatsapp: (person.whatsapp as string | null) ?? null,
      preferredChannel: (person.preferred_channel as string | null) ?? null,
    };
    const channel = pickChannel(contact);
    const to = contactForChannel(contact, channel);
    if (!to) { skipped++; continue; }
    let companyName: string | null = null;
    if (person.company_id) {
      const { data: c } = await sb.from("companies").select("name").eq("id", person.company_id).maybeSingle();
      companyName = (c?.name as string | null) ?? null;
    }
    const { error } = await sb.from("outbox").insert({
      channel, recipient_name: name, recipient_contact: to, company: companyName,
      subject: channel === "EMAIL" ? "Task reminder" : null, body,
      message_type: "TASK REMINDER", status: "Draft", source: tag, person_id: person.id as number, created_at: now,
    });
    if (error) { skipped++; continue; }
    names.push(first);
  }

  await recordEvent("portal.reminder.all", "ok", { by: me.name, role, task: t.code, count: names.length });
  revalidatePath("/outbox");
  return { ok: true, count: names.length, names, skipped };
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
    .select("id,status,company_id,code,owner_id")
    .eq("id", taskId)
    .maybeSingle();
  if (tErr || !t) return;

  const isManager = me.portalRole === "manager";
  const isDirector = me.portalRole === "director";
  const isHr = me.portalRole === "hr";
  const isManagement = isManager || isDirector || isHr;
  // Management roles are stamped distinctly so their posts get the management
  // accent everywhere (see authorOf in the portal task page and actorLabel in
  // timeline-entry.tsx). Directors → portal-dir, HR → portal-hr, managers → portal-mgr.
  const createdBy = `${isDirector ? "portal-dir" : isHr ? "portal-hr" : isManager ? "portal-mgr" : "portal"}:${me.name}`;
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
  let replyTarget: string | null = null;
  if (parentUpdateId) {
    replyTarget = await recipientForCreatedBy(parentCreatedBy);
    if (replyTarget && replyTarget !== personRecipient(me.id)) {
      await createNotification({
        recipient: replyTarget,
        kind: "reply",
        taskId,
        taskCode: code2,
        title: `${me.name} replied to you`,
        body,
        actor: me.name,
      });
    }
  }

  // A plain update should reach EVERYONE involved — not just the people it
  // @mentions or replies to. Notify the task's other assignees + its owner +
  // the admin owner, skipping the author and anyone already pinged above
  // (mentioned people, the reply target) so nobody is notified twice.
  const already = new Set<string>([personRecipient(me.id), ...mentionIds.map(personRecipient)]);
  if (replyTarget) already.add(replyTarget);
  const involved = new Set<number>(candidates.map((p) => p.id));
  if (t.owner_id) involved.add(t.owner_id as number);
  const updateRecipients = [...involved].map(personRecipient).filter((r) => !already.has(r));
  updateRecipients.push("admin");
  await notifyMany(updateRecipients, {
    kind: "update" as NotifKind,
    taskId,
    taskCode: code2,
    title: `${me.name} updated ${code2}`,
    // messageBody carries a "📎 file" fallback for file-only posts;
    // createNotification clamps the body to 200 chars.
    body: messageBody,
    actor: me.name,
  });

  const patch: Record<string, unknown> = { latest_update: messageBody, last_updated_at: now };

  // Optional status change, never on a task that is already Completed/Closed.
  // Completing/closing is NOT allowed here for anyone — it must go through the
  // gated portalCompleteTask (which requires an explanation + any required
  // proof). A plain update can only move a task between the open statuses.
  const allowed = STAFF_STATUSES;
  const currentStatus = t.status as string;
  const canChange =
    newStatus &&
    allowed.includes(newStatus) &&
    newStatus !== currentStatus &&
    currentStatus !== "Completed" &&
    currentStatus !== "Closed";
  if (canChange) {
    patch.status = newStatus;
    // Always an open status here (this path can't complete/close), so this clears
    // any stale closed_date on reopen — via the one helper (DUP-05).
    patch.closed_date = computeClosedDate(newStatus, null, now);
    await logChangeSb(
      taskId,
      t.code as string,
      t.company_id as number,
      "status",
      currentStatus,
      newStatus,
      isManagement ? "Completed/updated from portal" : "Updated from staff portal",
      createdBy
    );
  }

  const { error: upErr } = await sb.from("tasks").update(patch).eq("id", taskId);
  if (upErr) throw new Error(upErr.message);

  void reindexEntity("task", taskId); // latest_update/status may have moved (best-effort)
  revalidatePath(`/portal/task/${code}`);
  revalidatePath(`/task/${code}`);
  revalidatePath("/portal");
  await broadcastPulse("portal-update");
}

/* ----------------------------------------------------------------------
 * Secure completion gate. The ONLY path that sets a task Completed — every
 * role (including staff, who otherwise can't complete) may finish a task here,
 * but ONLY with a note explaining what was done, and a file when the task is
 * marked `requires_attachment`. Enforced server-side; the UI can't widen it.
 * ---------------------------------------------------------------------- */
export async function portalCompleteTask(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const taskId = Number(formData.get("taskId"));
  const code = String(formData.get("code") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const fileEntry = formData.get("attachment");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  if (!Number.isFinite(taskId)) return { ok: false, error: "Task not found." };
  if (!(await personCanSeeTask(me, taskId))) return { ok: false, error: "That task isn't in your view." };
  if (!body) return { ok: false, error: "Add a note explaining what was done." };

  const { data: t } = await sb
    .from("tasks")
    .select("id,status,company_id,code,requires_attachment,created_by_person_id,creator_close_only")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };
  const current = t.status as string;
  if (current === "Completed" || current === "Closed") return { ok: false, error: "This task is already finished." };
  if ((t.requires_attachment as boolean) && !file) return { ok: false, error: "This task needs a file attached to complete." };
  // Only a director/HR or the task's creator may complete it (task-permissions.ts).
  if (!canManageTask({ id: me.id, portalRole: me.portalRole }, { createdByPersonId: (t.created_by_person_id as number | null) ?? null })) {
    return { ok: false, error: "Only the person who set this task can complete it." };
  }

  const isManager = me.portalRole === "manager";
  const isDirector = me.portalRole === "director";
  const isHr = me.portalRole === "hr";
  const createdBy = `${isDirector ? "portal-dir" : isHr ? "portal-hr" : isManager ? "portal-mgr" : "portal"}:${me.name}`;
  const now = new Date().toISOString();

  let attachmentDocumentId: number | null = null;
  if (file) {
    attachmentDocumentId = await createTaskAttachment({ taskId, companyId: t.company_id as number | null, file, createdBy });
  }

  await sb.from("task_updates").insert({
    task_id: taskId,
    body,
    created_at: now,
    created_by: createdBy,
    attachment_document_id: attachmentDocumentId,
  });
  await sb.from("tasks").update({ status: "Completed", closed_date: computeClosedDate("Completed", null, now), latest_update: body, last_updated_at: now }).eq("id", taskId);
  await logChangeSb(taskId, t.code as string, t.company_id as number, "status", current, "Completed", "Completed from portal (with note)", createdBy);
  void reindexEntity("task", taskId); // Completed → lifecycle="history" (best-effort)
  // Cross-process cascade: if this task drives a pipeline case, advance it. Guarded.
  try { const m = await import("@/lib/automation-reactions"); await m.reactToTaskStatusChange(taskId, current, "Completed"); } catch { /* best-effort */ }

  revalidatePath(`/portal/task/${code}`);
  revalidatePath(`/task/${code}`);
  revalidatePath("/portal");
  revalidatePath("/portal/tasks");
  await broadcastPulse("portal-update");
  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Document compliance — staff upload their own required documents. The file
 * is filed as the person's own Document and linked to the checklist item as
 * "received"; verification stays with the administrator. We re-verify the
 * requirement belongs to the signed-in person — never trust the form.
 * ---------------------------------------------------------------------- */
const MAX_PORTAL_DOC_BYTES = 20 * 1024 * 1024; // 20 MB (matches the admin upload)

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
  if (file.size > MAX_PORTAL_DOC_BYTES) return { ok: false, error: "That file is too large (max 20 MB)." };

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

  // Read the file the same way the admin upload does, so a staff passport/permit
  // gets its expiry/issuer captured — otherwise the renewal radar never sees it.
  // The checklist already fixes the title + category, so we only take the dates
  // and issuer/reference; nothing here can overwrite an existing value (blank
  // record → blanks-only by definition).
  let expiryDate: string | undefined;
  let issueDate: string | undefined;
  let issuer: string | undefined;
  let referenceNo: string | undefined;
  try {
    const extractFd = new FormData();
    extractFd.set("file", file);
    const read = await extractDocumentFromFile(extractFd);
    if (read.ok) {
      expiryDate = read.fields.expiryDate;
      issueDate = read.fields.issueDate;
      issuer = read.fields.issuer;
      referenceNo = read.fields.referenceNo;
    }
  } catch {
    /* extraction is best-effort — never block the staff upload on it */
  }

  try {
    const docId = await createDocument(
      {
        title: label,
        personId: me.id,
        category,
        expiryDate,
        issueDate,
        issuer,
        referenceNo,
        notes: `Uploaded by ${me.name} via the staff portal.`,
      },
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
    // Tell someone. A pending request that pings nobody just sits unseen until
    // the approver happens to open the leave page — so notify the requester's
    // manager(s) (primary line + any "also reports to" lines) plus the owner.
    const [{ data: primary }, { data: dotted }] = await Promise.all([
      sb.from("people").select("manager_id").eq("id", me.id).maybeSingle(),
      sb.from("reporting_lines").select("manager_id").eq("person_id", me.id),
    ]);
    const managerIds = new Set<number>();
    if (primary?.manager_id) managerIds.add(primary.manager_id as number);
    for (const r of dotted ?? []) if (r.manager_id) managerIds.add(r.manager_id as number);
    const recipients = [...managerIds].map(personRecipient);
    recipients.push("admin");
    await notifyMany(recipients, {
      kind: "leave",
      title: `${me.name} requested leave`,
      body: "Tap to review and approve.",
      actor: me.name,
    });
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

  // Authorise: the requester must be in this manager's team (company-wide, plus
  // any cross-company direct report).
  const team = await managerTeamIds(me);
  if (!team.includes(req.person_id as number)) return { ok: false, error: "That isn't one of your team members." };

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

/** Staff self-check-in: record TODAY's attendance for the signed-in person.
 *  Trusted (no approval); managers/admin can override later. Only the
 *  self-settable statuses are accepted. */
export async function portalMarkAttendance(status: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (!(ATTENDANCE_SELF_STATUSES as string[]).includes(status)) return { ok: false, error: "That status isn't allowed." };
  const now = new Date();
  const iso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const ts = now.toISOString();
  // Select-then-insert/update (not upsert) so a repeat same-day self-check-in
  // doesn't clobber the original created_at.
  const existing = await sb
    .from("attendance")
    .select("id,note")
    .eq("person_id", me.id)
    .eq("date", iso)
    .maybeSingle();
  // On an UPDATE, only stamp the portal provenance note when there isn't already
  // an admin note on the row — otherwise a same-day re-check-in would wipe a note
  // the administrator left (e.g. a reason). An empty/portal note is fine to refresh.
  const existingNote = (existing.data?.note as string | null) ?? null;
  const adminNote = existingNote && !existingNote.startsWith("portal:");
  const { error } = existing.data
    ? await sb
        .from("attendance")
        .update(adminNote ? { status, updated_at: ts } : { status, note: `portal:${me.name}`, updated_at: ts })
        .eq("id", existing.data.id as number)
    : await sb
        .from("attendance")
        .insert({ person_id: me.id, date: iso, status, note: `portal:${me.name}`, updated_at: ts, created_at: ts });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal/profile");
  revalidatePath("/hrms/leave");
  revalidatePath("/people");
  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Staff personal to-dos (kind 'self'). A to-do with a time set becomes a
 * reminder — a timed push fires via /api/cron/reminders. Mirrors the owner's
 * to-do card on the admin Home; kept out of the admin Workbook by kind.
 * -------------------------------------------------------------------- */

export async function portalCreateTodo(input: {
  title: string;
  remindAt: string | null;
}): Promise<{ ok: boolean; error?: string; todo?: import("@/lib/todo-reminders").TodoCardItem }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Please sign in again." };
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Type what you need to do." };
  if (input.remindAt && Number.isNaN(Date.parse(input.remindAt))) return { ok: false, error: "That date didn't make sense." };
  const { createTodo } = await import("@/app/todos/actions");
  const todo = await createTodo({ title, remindAt: input.remindAt ?? null, personId: me.id, kind: "self" });
  revalidatePath("/portal");
  return { ok: true, todo };
}

export async function portalToggleTodoDone(id: number, done: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Please sign in again." };
  const { todoOwner } = await import("@/lib/todo-reminders");
  const o = await todoOwner(id);
  if (!o || o.kind !== "self" || o.personId !== me.id) return { ok: false, error: "That isn't your to-do." };
  const { toggleTodo } = await import("@/app/todos/actions");
  await toggleTodo(id, done);
  revalidatePath("/portal");
  return { ok: true };
}

export async function portalDeleteTodo(id: number): Promise<{ ok: boolean; error?: string }> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Please sign in again." };
  const { todoOwner } = await import("@/lib/todo-reminders");
  const o = await todoOwner(id);
  if (!o || o.kind !== "self" || o.personId !== me.id) return { ok: false, error: "That isn't your to-do." };
  const { deleteTodo } = await import("@/app/todos/actions");
  await deleteTodo(id);
  revalidatePath("/portal");
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
  if (me.portalRole === "staff") return;

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
