import "server-only";
import { sb } from "@/db/supabase";
import { escapeLike } from "@/lib/db-helpers";
import type { ToolDef } from "@/lib/ori/tools";
import { str, resolveCompany, resolvePerson } from "@/lib/ori/tools";

/* ORI people / HR / org domain tools.
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
// ── Org actions (src/lib/org-actions.ts) ────────────────────────────────────
import { setPersonDirector, addPersonManager, setDepartmentHead } from "@/lib/org-actions";

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
        redirect: "/people",
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
        redirect: "/people",
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
];
