import "server-only";
import { sb } from "@/db/supabase";
import { escapeLike } from "@/lib/db-helpers";
import type { ToolDef } from "@/lib/ori/tools";
import { str, resolveCompany, resolvePerson } from "@/lib/ori/tools";

/* ORI people / HR / requests / org domain tools.
 *
 * Every tool REUSES an existing server action or core helper — it never
 * reimplements a DB write. Tiers: 1 read · 2 internal write · 3
 * send/spend/delete/publish/access/settings (always confirmed by the route).
 * Undo specs use the `ori.*` namespace; the matching handlers live in
 * src/lib/undo-handlers/ori.ts (a sibling handler-owner adds any new kind this
 * file introduces — see the changelog note). */

// ── People / HR actions (src/app/people/actions.ts) ─────────────────────────
import {
  createPerson,
  setPeopleActive,
  snoozePerson,
  createProbationReviewTaskAction,
  setPortalRoleQuick,
  enablePortalAccessQuick,
  revokePortalAccessQuick,
} from "@/app/people/actions";
// ── Org actions (src/app/hrms/org/actions.ts) ───────────────────────────────
import { setPersonDirector, addPersonManager, setDepartmentHead } from "@/app/hrms/org/actions";
// ── Requests: core helpers (the admin wrappers redirect / gate on the admin
//    cookie; the core helpers ARE the real writes and are safe server-side). ──
import {
  raiseRequest,
  addRequestMessage,
  decideRequest,
  advanceRequest,
  cancelRequest,
  convertRequestToTask,
  type RaiseRecipient,
} from "@/lib/requests";

const OWNER = "Owner";

/** Snapshot a person's portal-access columns before a Tier-3 access change. */
async function snapshotPortalAccess(personId: number) {
  const { data } = await sb
    .from("people")
    .select("portal_password_hash, portal_enabled_at, portal_role, director_company_id")
    .eq("id", personId)
    .maybeSingle();
  return data ?? null;
}

/** Resolve a department by name, scoped to a company when given. */
async function resolveDepartment(name: string, companyId?: number) {
  const token = str(name);
  if (!token) return null;
  let q = sb.from("departments").select("id,name,company_id").ilike("name", `%${escapeLike(token)}%`);
  if (companyId != null) q = q.eq("company_id", companyId);
  const { data } = await q.limit(1).maybeSingle();
  return data ? { id: data.id as number, name: data.name as string, companyId: data.company_id as number | null } : null;
}

/** Resolve a request by its numeric id or code (e.g. "REQ-012"). */
async function resolveRequest(ref: string) {
  const token = str(ref);
  if (!token) return null;
  const asNum = Number(token);
  if (Number.isFinite(asNum) && asNum > 0) {
    const { data } = await sb.from("requests").select("id,code,title,status,converted_task_id").eq("id", asNum).maybeSingle();
    if (data) return data as { id: number; code: string; title: string; status: string; converted_task_id: number | null };
  }
  const { data } = await sb
    .from("requests")
    .select("id,code,title,status,converted_task_id")
    .ilike("code", escapeLike(token))
    .limit(1)
    .maybeSingle();
  return (data as { id: number; code: string; title: string; status: string; converted_task_id: number | null } | null) ?? null;
}

const QUICK_ROLES = ["staff", "manager", "hr", "director"];

export const PEOPLE_TOOLS: ToolDef[] = [
  // ── People / HR ───────────────────────────────────────────────────────────
  {
    name: "create_person",
    tier: 2,
    description:
      "Add a new person (staff, expat, outsider or candidate). Name is required; the rest are optional and only set when given.",
    params: {
      name: { type: "string", required: true, description: "Full name." },
      company: { type: "string", required: false, description: "Which company they belong to, by name." },
      role: { type: "string", required: false, description: "Job title / role (free text)." },
      email: { type: "string", required: false, description: "Email address." },
      phone: { type: "string", required: false, description: "Phone number." },
      whatsapp: { type: "string", required: false, description: "WhatsApp number." },
      manager: { type: "string", required: false, description: "Their primary manager, by name." },
      startDate: { type: "date", required: false, description: "Start date (YYYY-MM-DD)." },
      notes: { type: "string", required: false, description: "Any notes about the person." },
    },
    async run(args) {
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the person a name." };
      const fd = new FormData();
      fd.set("name", name);
      const role = str(args.role);
      if (role) fd.set("role", role);
      const email = str(args.email);
      if (email) fd.set("email", email);
      const phone = str(args.phone);
      if (phone) fd.set("phone", phone);
      const whatsapp = str(args.whatsapp);
      if (whatsapp) fd.set("whatsapp", whatsapp);
      const startDate = str(args.startDate);
      if (startDate) fd.set("startDate", startDate);
      const notes = str(args.notes);
      if (notes) fd.set("notes", notes);
      if (str(args.company)) {
        const c = await resolveCompany(str(args.company));
        if (!c) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
        fd.set("companyId", String(c.id));
      }
      if (str(args.manager)) {
        const m = await resolvePerson(str(args.manager));
        if (!m) return { ok: false, message: `Couldn't find a manager matching "${str(args.manager)}".` };
        fd.set("managerId", String(m.id));
      }
      const res = await createPerson(fd);
      if (!res.ok) return { ok: false, message: res.error };
      // No undo: creating a person spins off a checklist + onboarding journey;
      // reverse it deliberately with set_person_active (offboarding cascade).
      return { ok: true, message: `Added ${name}.`, redirect: "/people" };
    },
  },
  {
    name: "set_person_active",
    tier: 3,
    description:
      "Archive (offboard) or restore a person. Archiving runs the full offboarding cascade — vacates their leadership roles, orphans their direct reports, starts the offboarding checklist and returns their assets. Reversible.",
    params: {
      person: { type: "string", required: true, description: "Who, by name." },
      active: { type: "string", required: true, description: '"true" to restore, "false" to archive/offboard.' },
    },
    async run(args) {
      const who = str(args.person);
      const person = await resolvePerson(who);
      if (!person) return { ok: false, message: `Couldn't find an active person matching "${who}".` };
      const active = str(args.active).toLowerCase() === "true";
      const res = await setPeopleActive([person.id], active);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: active ? `Restored ${person.name}.` : `Archived ${person.name} and ran the offboarding cascade.`,
        redirect: "/people",
        // Flipping the flag back is the clean inverse; the cascade side-effects
        // (asset returns, journeys) are left as-is — the owner reviews them.
        undo: { kind: "ori.person.active", payload: { personId: person.id, before: !active } },
      };
    },
  },
  {
    name: "snooze_person",
    tier: 2,
    description: "Snooze a person from nudges/outreach until a date, or clear an existing snooze.",
    params: {
      person: { type: "string", required: true, description: "Who, by name." },
      until: { type: "date", required: false, description: "Snooze until this date (YYYY-MM-DD). Omit to clear the snooze." },
    },
    async run(args) {
      const who = str(args.person);
      const person = await resolvePerson(who);
      if (!person) return { ok: false, message: `Couldn't find an active person matching "${who}".` };
      const { data: row } = await sb.from("people").select("snoozed_until").eq("id", person.id).maybeSingle();
      const before = (row?.snoozed_until as string | null) ?? null;
      const until = str(args.until) || null;
      const res = await snoozePerson(person.id, until);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: until ? `Snoozed ${person.name} until ${until}.` : `Cleared the snooze on ${person.name}.`,
        redirect: "/people",
        undo: { kind: "ori.person.snooze", payload: { personId: person.id, before } },
      };
    },
  },
  {
    name: "create_probation_review",
    tier: 2,
    description: "Create a probation-review task for a person (owned by their manager, due around their probation end).",
    params: {
      person: { type: "string", required: true, description: "Whose probation review, by name." },
    },
    async run(args) {
      const who = str(args.person);
      const person = await resolvePerson(who);
      if (!person) return { ok: false, message: `Couldn't find an active person matching "${who}".` };
      const res = await createProbationReviewTaskAction(person.id);
      if (!res.ok) return { ok: false, message: res.error };
      // The task carries its own lifecycle; reverse with delete_task if needed.
      return { ok: true, message: `Created probation review ${res.code} for ${person.name}.`, redirect: `/task/${res.code}` };
    },
  },

  // ── Portal access & roles (Tier 3 — access changes) ────────────────────────
  {
    name: "set_portal_role",
    tier: 3,
    description:
      "Change a person's portal role (staff · manager · hr · director). They must already have portal access. A director set here is portfolio-wide; scope it to one company in Settings.",
    params: {
      person: { type: "string", required: true, description: "Who, by name." },
      role: { type: "string", required: true, description: "New role: staff, manager, hr or director." },
    },
    async run(args) {
      const who = str(args.person);
      const person = await resolvePerson(who);
      if (!person) return { ok: false, message: `Couldn't find an active person matching "${who}".` };
      const role = str(args.role).toLowerCase();
      if (!QUICK_ROLES.includes(role)) return { ok: false, message: `Role must be one of: ${QUICK_ROLES.join(", ")}.` };
      const before = await snapshotPortalAccess(person.id);
      const res = await setPortalRoleQuick(person.id, role);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Set ${person.name}'s portal role to ${role}.`,
        redirect: "/people",
        undo: before ? { kind: "ori.portal.access", payload: { personId: person.id, before } } : undefined,
      };
    },
  },
  {
    name: "set_portal_access",
    tier: 3,
    description:
      "Grant or revoke a person's staff-portal sign-in. Granting sets a password (min 8 chars) and role; revoking removes sign-in and resets the role to staff.",
    params: {
      person: { type: "string", required: true, description: "Who, by name." },
      grant: { type: "string", required: true, description: '"true" to grant access, "false" to revoke it.' },
      password: { type: "string", required: false, description: "The sign-in password when granting (at least 8 characters)." },
      role: { type: "string", required: false, description: "Role when granting: staff (default), manager, hr or director." },
    },
    async run(args) {
      const who = str(args.person);
      const person = await resolvePerson(who);
      if (!person) return { ok: false, message: `Couldn't find an active person matching "${who}".` };
      const grant = str(args.grant).toLowerCase() === "true";
      const before = await snapshotPortalAccess(person.id);
      if (grant) {
        const password = str(args.password);
        if (password.length < 8) return { ok: false, message: "Set a password of at least 8 characters to grant access." };
        const role = str(args.role).toLowerCase() || "staff";
        if (!QUICK_ROLES.includes(role)) return { ok: false, message: `Role must be one of: ${QUICK_ROLES.join(", ")}.` };
        const res = await enablePortalAccessQuick(person.id, role, password);
        if (!res.ok) return { ok: false, message: res.error };
        return {
          ok: true,
          message: `Granted portal access to ${person.name} (${role}).`,
          redirect: "/people",
          undo: before ? { kind: "ori.portal.access", payload: { personId: person.id, before } } : undefined,
        };
      }
      const res = await revokePortalAccessQuick(person.id);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Revoked ${person.name}'s portal access.`,
        redirect: "/people",
        undo: before ? { kind: "ori.portal.access", payload: { personId: person.id, before } } : undefined,
      };
    },
  },
  {
    name: "set_person_director",
    tier: 3,
    description:
      "Set (or clear) a person's PRIMARY manager — the solid reporting line. Pass no manager to clear it. Refuses changes that would loop the reporting chain.",
    params: {
      person: { type: "string", required: true, description: "Whose primary manager, by name." },
      manager: { type: "string", required: false, description: "The primary manager, by name. Omit to clear it." },
    },
    async run(args) {
      const who = str(args.person);
      const person = await resolvePerson(who);
      if (!person) return { ok: false, message: `Couldn't find an active person matching "${who}".` };
      const { data: row } = await sb.from("people").select("manager_id").eq("id", person.id).maybeSingle();
      const beforeManager = (row?.manager_id as number | null) ?? null;
      let managerId: number | null = null;
      if (str(args.manager)) {
        const m = await resolvePerson(str(args.manager));
        if (!m) return { ok: false, message: `Couldn't find a manager matching "${str(args.manager)}".` };
        managerId = m.id;
      }
      const res = await setPersonDirector(person.id, managerId);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: managerId ? `Set ${person.name}'s primary manager.` : `Cleared ${person.name}'s primary manager.`,
        redirect: "/hrms/org",
        undo: { kind: "ori.person.manager", payload: { personId: person.id, before: beforeManager } },
      };
    },
  },
  {
    name: "add_manager",
    tier: 2,
    description:
      'Add a secondary "also reports to" manager (a dotted reporting line) for a person. Refuses changes that would loop the reporting chain.',
    params: {
      person: { type: "string", required: true, description: "Who reports, by name." },
      manager: { type: "string", required: true, description: "The additional manager, by name." },
    },
    async run(args) {
      const who = str(args.person);
      const person = await resolvePerson(who);
      if (!person) return { ok: false, message: `Couldn't find an active person matching "${who}".` };
      const m = await resolvePerson(str(args.manager));
      if (!m) return { ok: false, message: `Couldn't find a manager matching "${str(args.manager)}".` };
      const res = await addPersonManager(person.id, m.id);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `${person.name} now also reports to ${m.name}.`,
        redirect: "/hrms/org",
        undo: { kind: "ori.person.dotted", payload: { personId: person.id, managerId: m.id } },
      };
    },
  },
  {
    name: "set_department_head",
    tier: 2,
    description: "Set (or clear) the head of a department for a company.",
    params: {
      company: { type: "string", required: true, description: "Which company, by name." },
      department: { type: "string", required: true, description: "Which department, by name." },
      head: { type: "string", required: false, description: "The head, by name. Omit to clear the head." },
    },
    async run(args) {
      const c = await resolveCompany(str(args.company));
      if (!c) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
      const dept = await resolveDepartment(str(args.department), c.id);
      if (!dept) return { ok: false, message: `Couldn't find department "${str(args.department)}" in ${c.name}.` };
      // Snapshot the current head for a clean undo.
      const { data: cur } = await sb
        .from("department_heads")
        .select("head_person_id")
        .eq("company_id", c.id)
        .eq("department_id", dept.id)
        .maybeSingle();
      const before = (cur?.head_person_id as number | null) ?? null;
      let headId: number | null = null;
      if (str(args.head)) {
        const h = await resolvePerson(str(args.head));
        if (!h) return { ok: false, message: `Couldn't find a person matching "${str(args.head)}".` };
        headId = h.id;
      }
      await setDepartmentHead(c.id, dept.id, headId);
      return {
        ok: true,
        message: headId ? `Set the head of ${dept.name} at ${c.name}.` : `Cleared the head of ${dept.name} at ${c.name}.`,
        redirect: `/companies/${c.id}`,
        undo: { kind: "ori.department.head", payload: { companyId: c.id, departmentId: dept.id, before } },
      };
    },
  },

  // ── Requests (wrap the core helpers in src/lib/requests.ts) ─────────────────
  {
    name: "raise_request",
    tier: 2,
    description: "Raise a request from the owner to one or more staff (an ask/approval flow, not a task).",
    params: {
      title: { type: "string", required: true, description: "What the request is, in a few words." },
      recipients: { type: "string[]", required: true, description: "The people it is for, by name." },
      body: { type: "string", required: false, description: "Details of the request." },
      category: { type: "string", required: false, description: "A category label." },
    },
    async run(args) {
      const title = str(args.title);
      if (!title) return { ok: false, message: "Say what the request is in a few words." };
      const names = Array.isArray(args.recipients) ? (args.recipients as unknown[]).map((x) => str(x)).filter(Boolean) : [];
      if (!names.length) return { ok: false, message: "Choose who this request is for." };
      const recipients: RaiseRecipient[] = [];
      const unresolved: string[] = [];
      for (const nm of names) {
        const p = await resolvePerson(nm);
        if (p) recipients.push({ personId: p.id, isOwner: false });
        else unresolved.push(nm);
      }
      if (!recipients.length) return { ok: false, message: `Couldn't find any recipient matching: ${unresolved.join(", ")}.` };
      const r = await raiseRequest({
        requesterId: null,
        fromOwner: true,
        recipients,
        companyId: null,
        category: str(args.category) || null,
        title,
        body: str(args.body) || null,
        createdBy: "web-ui",
        actorName: OWNER,
      });
      const note = unresolved.length ? ` (couldn't match: ${unresolved.join(", ")})` : "";
      return {
        ok: true,
        message: `Raised request ${r.code} to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}.${note}`,
        redirect: `/requests/${r.id}`,
        undo: { kind: "ori.request.raise", payload: { requestId: r.id } },
      };
    },
  },
  {
    name: "reply_request",
    tier: 2,
    description: "Post a reply message on a request thread.",
    params: {
      request: { type: "string", required: true, description: "Which request, by id or code (e.g. REQ-012)." },
      body: { type: "string", required: true, description: "The message to post." },
    },
    async run(args) {
      const req = await resolveRequest(str(args.request));
      if (!req) return { ok: false, message: `Couldn't find a request matching "${str(args.request)}".` };
      const text = str(args.body);
      if (!text) return { ok: false, message: "Write a message to post." };
      await addRequestMessage(req.id, text, "web-ui", "admin", OWNER);
      // A posted message has no clean single-step inverse — no undo.
      return { ok: true, message: `Replied on ${req.code}.`, redirect: `/requests/${req.id}` };
    },
  },
  {
    name: "decide_request",
    tier: 2,
    description: "Decide a request: approve, decline or note it, with an optional reason.",
    params: {
      request: { type: "string", required: true, description: "Which request, by id or code." },
      verdict: { type: "string", required: true, description: "One of: approved, declined, noted." },
      reason: { type: "string", required: false, description: "An optional reason shown to the requester." },
    },
    async run(args) {
      const req = await resolveRequest(str(args.request));
      if (!req) return { ok: false, message: `Couldn't find a request matching "${str(args.request)}".` };
      const verdict = str(args.verdict).toLowerCase();
      if (verdict !== "approved" && verdict !== "declined" && verdict !== "noted") {
        return { ok: false, message: "Verdict must be approved, declined or noted." };
      }
      const before = { status: req.status };
      await decideRequest(req.id, verdict, str(args.reason) || null, "web-ui", OWNER, "admin");
      return {
        ok: true,
        message: `Marked ${req.code} ${verdict}.`,
        redirect: `/requests/${req.id}`,
        undo: { kind: "ori.request.status", payload: { requestId: req.id, before } },
      };
    },
  },
  {
    name: "advance_request",
    tier: 2,
    description: "Move a request along its workflow: open, in_progress, done or needs_info.",
    params: {
      request: { type: "string", required: true, description: "Which request, by id or code." },
      status: { type: "string", required: true, description: "One of: open, in_progress, done, needs_info." },
    },
    async run(args) {
      const req = await resolveRequest(str(args.request));
      if (!req) return { ok: false, message: `Couldn't find a request matching "${str(args.request)}".` };
      const status = str(args.status).toLowerCase();
      if (status !== "open" && status !== "in_progress" && status !== "done" && status !== "needs_info") {
        return { ok: false, message: "Status must be open, in_progress, done or needs_info." };
      }
      const before = { status: req.status };
      await advanceRequest(req.id, status, "web-ui", OWNER, "admin");
      return {
        ok: true,
        message: `Moved ${req.code} to ${status.replace("_", " ")}.`,
        redirect: `/requests/${req.id}`,
        undo: { kind: "ori.request.status", payload: { requestId: req.id, before } },
      };
    },
  },
  {
    name: "cancel_request",
    tier: 3,
    description: "Withdraw (cancel) a request. Reversible — the request is marked cancelled, not deleted.",
    params: {
      request: { type: "string", required: true, description: "Which request, by id or code." },
    },
    async run(args) {
      const req = await resolveRequest(str(args.request));
      if (!req) return { ok: false, message: `Couldn't find a request matching "${str(args.request)}".` };
      if (req.status === "cancelled") return { ok: false, message: `${req.code} is already cancelled.` };
      const before = { status: req.status };
      await cancelRequest(req.id, "web-ui");
      return {
        ok: true,
        message: `Withdrew ${req.code}.`,
        redirect: `/requests/${req.id}`,
        undo: { kind: "ori.request.status", payload: { requestId: req.id, before } },
      };
    },
  },
  {
    name: "convert_request_to_task",
    tier: 2,
    description: "Turn a request into a real task, linked both ways, for a company and an accountable person.",
    params: {
      request: { type: "string", required: true, description: "Which request, by id or code." },
      company: { type: "string", required: true, description: "The company for the new task, by name." },
      accountable: { type: "string", required: true, description: "Who is responsible for the task, by name." },
      priority: { type: "string", required: false, description: "Critical, High, Medium (default) or Low." },
      deadline: { type: "date", required: false, description: "A due date (YYYY-MM-DD)." },
    },
    async run(args) {
      const req = await resolveRequest(str(args.request));
      if (!req) return { ok: false, message: `Couldn't find a request matching "${str(args.request)}".` };
      if (req.converted_task_id != null) return { ok: false, message: `${req.code} has already been turned into a task.` };
      const c = await resolveCompany(str(args.company));
      if (!c) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
      const acc = await resolvePerson(str(args.accountable));
      if (!acc) return { ok: false, message: `Couldn't find a person matching "${str(args.accountable)}".` };
      const deadlineRaw = str(args.deadline);
      const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
      if (deadline && Number.isNaN(deadline.getTime())) return { ok: false, message: "That deadline isn't a valid date." };
      const r = await convertRequestToTask({
        requestId: req.id,
        companyId: c.id,
        accountableId: acc.id,
        workingIds: [],
        priority: str(args.priority) || "Medium",
        deadline,
        by: "web-ui",
        actorName: OWNER,
        actorRecipient: "admin",
      });
      // No undo: the conversion mints a task + links; unwind deliberately via
      // delete_task, which has its own reversal.
      return { ok: true, message: `Created task ${r.taskCode} from ${req.code}.`, redirect: `/task/${r.taskCode}` };
    },
  },
];
