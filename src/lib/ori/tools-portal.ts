import "server-only";
import { sb } from "@/db/supabase";
import type { ToolDef } from "@/lib/ori/tools";
import { str, nowIso, resolveTask } from "@/lib/ori/tools";
import { reindexEntity } from "@/lib/index-hooks";
import {
  type CapabilityKey,
  type PortalPermissionsConfig,
  type PortalRoleKey,
  CAPABILITY_GROUPS,
  PORTAL_ROLES,
  permits,
} from "@/lib/portal-permissions";
import { getPortalPermissions, savePortalPermissions } from "@/lib/portal-permissions-store";

/* ORI portal domain tools.
 *
 * Two capabilities that reach INTO the portal layer:
 *   • post_as_ori          — post a task update authored honestly as ORI (tier 2).
 *   • set_role_capability   — toggle one portal role's permission (tier 3, access).
 *
 * Both REUSE existing writes/resolvers rather than reimplementing them. Undo specs
 * use the `ori.*` namespace; matching handlers live in src/lib/undo-handlers/ori.ts
 * (post_as_ori reuses the existing `task.update.add` inverse; set_role_capability
 * adds `ori.portal.capability`). */

/** The real, validated set of toggle-able capability keys (from the pure model). */
const CAP_KEYS: CapabilityKey[] = CAPABILITY_GROUPS.flatMap((g) => g.caps.map((c) => c.key));
const CAP_LABEL = new Map<string, string>(CAPABILITY_GROUPS.flatMap((g) => g.caps.map((c) => [c.key, c.label] as const)));

function parseOnOff(v: unknown): boolean | null {
  const s = str(v).toLowerCase();
  if (["on", "true", "yes", "enable", "enabled", "allow", "1"].includes(s)) return true;
  if (["off", "false", "no", "disable", "disabled", "deny", "block", "0"].includes(s)) return false;
  if (typeof v === "boolean") return v;
  return null;
}

export const PORTAL_TOOLS: ToolDef[] = [
  {
    name: "post_as_ori",
    tier: 2,
    description: "Post an update / note on a task, authored honestly as ORI (not as you). Optionally move the task's status. Use when you want ORI to leave a note on the record.",
    params: {
      taskCode: { type: "string", required: true, description: "The task code, e.g. DAR-007." },
      body: { type: "string", required: true, description: "The update text ORI should post." },
      status: { type: "string", required: false, description: "Optional new status to move the task to." },
    },
    async run(args) {
      const t = await resolveTask(str(args.taskCode));
      if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
      const body = str(args.body);
      if (!body) return { ok: false, message: "The update is empty." };
      // Snapshot the fields the update touches (mirrors the core add_task_update
      // undo so the existing `task.update.add` inverse can reverse it cleanly).
      const { data: bt } = await sb.from("tasks").select("latest_update,last_updated_at,status,closed_date").eq("id", t.id).maybeSingle();
      const before = (bt as Record<string, unknown>) ?? {};
      // Honest authorship: created_by "ori" (not "web-ui"/"ai-command") so the
      // record shows ORI wrote it. Same write shape as adminAddUpdate/core update.
      const { data: ins } = await sb.from("task_updates").insert({ task_id: t.id, body, created_at: nowIso(), created_by: "ori" }).select("id").single();
      const patch: Record<string, unknown> = { latest_update: body, last_updated_at: nowIso() };
      const status = str(args.status);
      if (status && status !== t.status) patch.status = status;
      await sb.from("tasks").update(patch).eq("id", t.id);
      void reindexEntity("task", t.id);
      const undo = ins?.id
        ? { kind: "task.update.add", payload: { taskUpdateId: ins.id, taskId: t.id, taskCode: t.code, companyId: t.company_id, before: { latestUpdate: before.latest_update ?? null, lastUpdatedAt: before.last_updated_at ?? null, status: before.status ?? t.status, closedDate: before.closed_date ?? null } } }
        : undefined;
      return { ok: true, message: `ORI posted an update to ${t.code}${status ? ` and set it to ${status}` : ""}.`, redirect: `/task/${t.code}`, undo };
    },
  },
  {
    name: "set_role_capability",
    tier: 3,
    description: "Turn a portal ROLE permission on or off (access-sensitive — always confirmed). E.g. let managers create events, or stop staff from acting with ORI.",
    params: {
      role: { type: "string", required: true, description: "Which portal role: staff | manager | hr | director." },
      capability: { type: "string", required: true, description: "The permission key to toggle (e.g. createTasks, approveLeave, oriAct, navOutbox)." },
      on: { type: "string", required: true, description: "on to grant the permission, off to remove it." },
    },
    async run(args) {
      const role = str(args.role).toLowerCase() as PortalRoleKey;
      if (!PORTAL_ROLES.includes(role)) return { ok: false, message: `"${str(args.role)}" isn't a portal role — use staff, manager, hr or director.` };
      const capability = str(args.capability) as CapabilityKey;
      if (!CAP_KEYS.includes(capability)) return { ok: false, message: `"${str(args.capability)}" isn't a known permission. Valid ones: ${CAP_KEYS.join(", ")}.` };
      const on = parseOnOff(args.on);
      if (on == null) return { ok: false, message: "Should the permission be on or off?" };

      const config = await getPortalPermissions();
      const prev = permits(config, role, capability); // effective value before the change (config over defaults)
      if (prev === on) return { ok: false, message: `${CAP_LABEL.get(capability)} is already ${on ? "on" : "off"} for ${role}s — nothing to change.` };

      // Merge one cell over the stored config; leave every other cell untouched.
      const next: PortalPermissionsConfig = { ...config, caps: { ...(config.caps ?? {}) } };
      next.caps![capability] = { ...(config.caps?.[capability] ?? {}), [role]: on };
      await savePortalPermissions(next);

      return {
        ok: true,
        message: `${CAP_LABEL.get(capability)} is now ${on ? "on" : "off"} for ${role}s.`,
        redirect: "/settings?section=portals",
        undo: { kind: "ori.portal.capability", payload: { role, capability, before: prev } },
      };
    },
  },
];
