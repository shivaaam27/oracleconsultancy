"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { notifyMany, personRecipient } from "@/lib/notifications";
import { getPortalPerson, companyScope } from "@/lib/portal-auth";
import { reindexEntity } from "@/lib/index-hooks";

/* Staff-portal BULK task creation — "paste multiple", one task per line.
 *
 * Mirrors the single-task paths in actions.ts (portalCreateTask for
 * manager/hr, portalDirectorCreateTask for director) but loops over a list of
 * titles and collects per-line failures instead of failing the whole batch.
 *
 * Same shared fields (company, leads, working, priority, deadline, instruction)
 * apply to EVERY pasted line. Scope rules are re-verified server-side per role —
 * never trust the client.
 */

export type PortalBulkCreateInput = {
  titles: string[];
  companyIds: number[];
  leadIds: number[];
  workingIds?: number[];
  priority?: string;
  deadline?: string | null;
  instruction?: string;
};

export type PortalBulkFailure = { title: string; reason: string };

export type PortalBulkResult =
  | { ok: true; created: number; failures: PortalBulkFailure[] }
  | { ok: false; error: string };

export async function portalBulkCreateTasks(
  input: PortalBulkCreateInput
): Promise<PortalBulkResult> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Please sign in again." };
  if (!me.caps.createTasks) {
    return { ok: false, error: "You don't have permission to create tasks." };
  }

  // Clean the pasted lines: trim, drop blanks, de-dupe nothing (a repeated line
  // is a deliberate separate task).
  const titles = (input.titles ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  if (titles.length === 0) return { ok: false, error: "Add at least one task (one per line)." };

  const leadIdsRaw = Array.from(new Set((input.leadIds ?? []).filter((n) => Number.isFinite(n) && n > 0)));
  const workingIdsRaw = Array.from(
    new Set((input.workingIds ?? []).filter((n) => Number.isFinite(n) && n > 0 && !leadIdsRaw.includes(n)))
  );
  if (leadIdsRaw.length === 0) return { ok: false, error: "Choose at least one responsible person." };

  const companyIdsRaw = Array.from(new Set((input.companyIds ?? []).filter((n) => Number.isFinite(n) && n > 0)));
  if (companyIdsRaw.length === 0) return { ok: false, error: "Choose a company." };

  const priority = String(input.priority ?? "Medium");
  const deadlineRaw = (input.deadline ?? "").trim();
  const deadlineDate = deadlineRaw ? new Date(deadlineRaw) : null;
  const deadline = deadlineDate && !isNaN(deadlineDate.getTime()) ? deadlineDate : null;
  const instruction = String(input.instruction ?? "").trim();

  // ── Role-scoped validation (mirror the single-task paths exactly) ──────────
  let leads: number[];
  let workings: number[];
  let companyIds: number[];

  if (me.portalRole === "director") {
    // Group-wide: any active person, any companies (fan out per company per title).
    const { data: activeRows } = await sb
      .from("people").select("id").eq("active", true).in("id", [...leadIdsRaw, ...workingIdsRaw]);
    const activeSet = new Set((activeRows ?? []).map((r) => r.id as number));
    leads = leadIdsRaw.filter((id) => activeSet.has(id));
    if (leads.length === 0) return { ok: false, error: "The responsible person isn't available." };
    workings = workingIdsRaw.filter((id) => activeSet.has(id) && !leads.includes(id));
    companyIds = companyIdsRaw; // multiple companies allowed
  } else if (me.portalRole === "hr") {
    // HR is group-wide for people, but bulk keeps a single company (companyIds[0]).
    const { data: activeRows } = await sb
      .from("people").select("id").eq("active", true).in("id", [...leadIdsRaw, ...workingIdsRaw]);
    const activeSet = new Set((activeRows ?? []).map((r) => r.id as number));
    leads = leadIdsRaw.filter((id) => activeSet.has(id));
    if (leads.length === 0) return { ok: false, error: "The responsible person isn't available." };
    workings = workingIdsRaw.filter((id) => activeSet.has(id) && !leads.includes(id));
    companyIds = [companyIdsRaw[0]];
  } else {
    // Manager: company-scoped. May fan out across ANY of their own companies, to
    // any active person who belongs to those companies (matches the single-task
    // path + the scoped pickers). companyScope(manager) = their company set.
    const scope = (await companyScope(me)) ?? [];
    const scopeSet = new Set(scope);
    companyIds = companyIdsRaw.filter((c) => scopeSet.has(c));
    if (companyIds.length === 0) return { ok: false, error: "You can't create tasks for that company." };
    const [{ data: pr }, { data: lr }] = await Promise.all([
      sb.from("people").select("id").eq("active", true).in("company_id", scope).in("id", [...leadIdsRaw, ...workingIdsRaw]),
      sb.from("person_companies").select("person_id").in("company_id", scope).in("person_id", [...leadIdsRaw, ...workingIdsRaw]),
    ]);
    const inScope = new Set<number>([me.id, ...(pr ?? []).map((r) => r.id as number), ...(lr ?? []).map((r) => r.person_id as number)]);
    leads = leadIdsRaw.filter((id) => inScope.has(id));
    if (leads.length === 0) return { ok: false, error: "Choose someone in your companies." };
    workings = workingIdsRaw.filter((id) => inScope.has(id) && !leads.includes(id));
  }

  const now = new Date();
  const createdBy = `${me.portalRole === "director" ? "portal-dir" : me.portalRole === "hr" ? "portal-hr" : "portal-mgr"}:${me.name}`;

  // Resolve each company's prefix once (skip unknown ids — fail those lines).
  const companyInfo = new Map<number, { prefix: string }>();
  for (const cid of companyIds) {
    const { data: company } = await sb.from("companies").select("code,code_prefix").eq("id", cid).maybeSingle();
    if (company) {
      companyInfo.set(cid, { prefix: (company.code_prefix as string | null) || (company.code as string) });
    }
  }

  let created = 0;
  const failures: PortalBulkFailure[] = [];

  // One task per (title × company). A failure on one line never aborts the rest.
  for (const title of titles) {
    for (const companyId of companyIds) {
      const info = companyInfo.get(companyId);
      const label = companyIds.length > 1 ? `${title} (company #${companyId})` : title;
      if (!info) {
        failures.push({ title: label, reason: "Company not found." });
        continue;
      }
      try {
        const task = await insertTaskWithUniqueCodeSb(companyId, info.prefix, {
          actionItem: title,
          ownerId: leads[0],
          status: "Not Started",
          priority,
          deadline,
          createdDate: now,
          lastUpdatedAt: now,
          latestUpdate: instruction || null,
          archived: false,
          createdByPersonId: me.id,
        });

        // Assignees: leads accountable, working set working.
        const rows = [
          ...leads.map((id) => ({ task_id: task.id, person_id: id, role: "accountable" })),
          ...workings.map((id) => ({ task_id: task.id, person_id: id, role: "working" })),
        ];
        await sb.from("task_assignees").upsert(rows, { onConflict: "task_id,person_id", ignoreDuplicates: true });

        // The shared instruction becomes the pinned first message on each task.
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
          new_value: title,
          change_reason: "Created via portal bulk add",
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
          body: title,
          actor: me.name,
        });

        void reindexEntity("task", task.id); // new task — index it (best-effort)
        created++;
      } catch (err) {
        failures.push({ title: label, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  revalidatePath("/portal");
  revalidatePath("/portal/tasks");
  revalidatePath("/portal/board");
  revalidatePath("/");

  return { ok: true, created, failures };
}
