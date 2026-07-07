import "server-only";
import { sb } from "@/db/supabase";
import type { ToolDef } from "@/lib/ori/tools";
import { str, nowIso, resolveTask, resolvePerson, resolveCompany } from "@/lib/ori/tools";
import type { SmartActions, SmartAudience, SmartCondition, SmartScope, SmartTrigger } from "@/lib/ori/automations";

/* create_smart_reminder — the ONE ORI tool for the conditional, time-of-day
 * "smart reminder" recipe (see automations.ts smart_reminder + the cron firing).
 *
 * Recipe: WHEN (byHour / daysBeforeDeadline / onOverdue) · IF (condition) · WHOSE
 * tasks (person / company / task scope) · WHO hears (owner / directors / the person
 * / extra people) · DO (audience-only, OR the OPT-IN auto-act: post an update, set a
 * status, send email/WhatsApp).
 *
 * TIER 3 — because it can AUTO-ACT (post/change/send with no human in the loop), so
 * the agent ALWAYS confirms it at creation. Auto-act DEFAULTS OFF: the owner must
 * clearly ask ORI to "post/update/change it automatically" for actions.autoAct to be
 * set. External send stays gated by canAutoSend() at fire time (fail-closed); the
 * rule never auto-deletes. Undo = delete the rule (ori.automation.create). */

const VALID_CONDITIONS: SmartCondition[] = ["no_update_today", "overdue", "compliance_due_soon", "always"];
const VALID_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];

function truthy(v: unknown): boolean {
  const s = str(v).toLowerCase();
  return v === true || ["1", "true", "yes", "on", "y"].includes(s);
}

export const SMART_TOOLS: ToolDef[] = [
  {
    name: "create_smart_reminder",
    tier: 3,
    description:
      "Set a SMART conditional reminder: WHEN a time-of-day or deadline window is reached, IF a condition holds (no update today / overdue / compliance due soon), notify a chosen audience (you, directors, the person, named people), and OPTIONALLY (opt-in only) auto-act — post an update on the task, change its status, or send email/WhatsApp. Auto-act is OFF unless the owner clearly says to do it automatically. Always confirmed before it's created.",
    params: {
      person: { type: "string", required: false, description: "WHOSE tasks — a person by name (scope). Give a person, company or taskCode." },
      company: { type: "string", required: false, description: "WHOSE tasks — a company by name (scope)." },
      taskCode: { type: "string", required: false, description: "WHOSE task — a specific task code (scope)." },
      byHour: { type: "number", required: false, description: "WHEN — fire once this hour of day (0–23, Dar es Salaam) is reached, e.g. 11 for 11am." },
      daysBeforeDeadline: { type: "number", required: false, description: "WHEN — fire this many days before the task's deadline." },
      onOverdue: { type: "string", required: false, description: "WHEN — 'yes' to fire only once the task is overdue." },
      condition: { type: "string", required: false, description: "IF — no_update_today | overdue | compliance_due_soon | always (default always)." },
      notifyOwner: { type: "string", required: false, description: "WHO — 'yes' to notify you (the owner/admin)." },
      notifyDirectors: { type: "string", required: false, description: "WHO — 'yes' to notify all directors." },
      warnPerson: { type: "string", required: false, description: "WHO — 'yes' to warn the scoped person." },
      notifyPeople: { type: "string[]", required: false, description: "WHO — extra people to notify, by name." },
      autoAct: { type: "string", required: false, description: "DO — 'yes' ONLY if the owner explicitly wants ORI to act automatically (default no = notify only)." },
      postUpdate: { type: "string", required: false, description: "DO (auto-act) — 'yes' to post an update on the task automatically." },
      updateText: { type: "string", required: false, description: "DO — the text to post / the reminder wording." },
      setStatus: { type: "string", required: false, description: "DO (auto-act) — a status to move the task to automatically (e.g. Escalated)." },
      sendChannel: { type: "string", required: false, description: "DO (auto-act) — email | whatsapp to also send the person an external message (only if that channel's auto-send is ON)." },
    },
    async run(args) {
      // ── WHOSE (scope) — at least one of person / company / task ───────────────
      const scope: SmartScope = {};
      let scopeLabel = "";
      let companyId: number | null = null;
      if (str(args.taskCode)) {
        const t = await resolveTask(str(args.taskCode));
        if (!t) return { ok: false, message: `Task ${str(args.taskCode)} not found.` };
        scope.taskId = t.id; companyId = t.company_id; scopeLabel = t.code;
      }
      if (str(args.person)) {
        const p = await resolvePerson(str(args.person));
        if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.person)}".` };
        scope.personId = p.id; scopeLabel = scopeLabel || p.name;
      }
      if (str(args.company)) {
        const c = await resolveCompany(str(args.company));
        if (!c) return { ok: false, message: `Couldn't match a company called "${str(args.company)}".` };
        scope.companyId = c.id; companyId = companyId ?? c.id; scopeLabel = scopeLabel || c.name;
      }
      if (!scope.taskId && !scope.personId && !scope.companyId) {
        return { ok: false, message: "Whose tasks should this watch — a person, a company, or a specific task?" };
      }

      // ── WHEN (trigger) ────────────────────────────────────────────────────────
      const trigger: SmartTrigger = {};
      if (Number.isFinite(Number(args.byHour))) trigger.byHour = Math.min(23, Math.max(0, Math.round(Number(args.byHour))));
      if (Number.isFinite(Number(args.daysBeforeDeadline))) trigger.daysBeforeDeadline = Math.max(0, Math.round(Number(args.daysBeforeDeadline)));
      if (truthy(args.onOverdue)) trigger.onOverdue = true;

      // ── IF (condition) ────────────────────────────────────────────────────────
      const condRaw = str(args.condition) as SmartCondition;
      const condition: SmartCondition = VALID_CONDITIONS.includes(condRaw) ? condRaw : "always";

      // ── WHO (audience) — must reach someone ────────────────────────────────────
      const audience: SmartAudience = {};
      if (truthy(args.notifyOwner)) audience.notifyOwner = true;
      if (truthy(args.notifyDirectors)) audience.notifyDirectors = true;
      if (truthy(args.warnPerson)) audience.warnPerson = true;
      const extra = Array.isArray(args.notifyPeople) ? (args.notifyPeople as unknown[]) : [];
      const extraIds: number[] = [];
      const extraNames: string[] = [];
      for (const n of extra) { const p = await resolvePerson(str(n)); if (p) { extraIds.push(p.id); extraNames.push(p.name); } }
      if (extraIds.length) audience.notifyPersonIds = extraIds;

      // ── DO (actions) — auto-act OPT-IN ONLY (default OFF) ──────────────────────
      const actions: SmartActions = {};
      const wantAuto = truthy(args.autoAct);
      if (str(args.updateText)) actions.updateText = str(args.updateText);
      if (wantAuto) {
        actions.autoAct = true;
        if (truthy(args.postUpdate)) actions.postUpdate = true;
        const setStatus = str(args.setStatus);
        if (VALID_STATUSES.includes(setStatus)) actions.setStatus = setStatus;
        const ch = str(args.sendChannel).toLowerCase();
        if (ch === "email" || ch === "whatsapp") actions.sendChannel = ch;
      }
      // If auto-act is on but the owner named no concrete action, default to a gentle
      // posted update (the safest of the three; still guardrail-free = internal).
      if (actions.autoAct && !actions.postUpdate && !actions.setStatus && !actions.sendChannel) {
        actions.postUpdate = true;
      }

      // A rule that neither notifies anyone NOR auto-acts is a no-op — refuse.
      if (!audience.notifyOwner && !audience.notifyDirectors && !audience.warnPerson && !extraIds.length && !actions.autoAct) {
        return { ok: false, message: "Who should hear about this — you, the directors, the person, or someone named? (Or should ORI act on it automatically?)" };
      }

      const config = { trigger, condition, scope, audience, actions };
      const { data, error } = await sb.from("automation_rules").insert({
        task_id: scope.taskId ?? null, company_id: companyId, kind: "smart_reminder", config,
        active: true, done: false, created_by: "ai-command", created_at: nowIso(),
      }).select("id").single();
      if (error || !data) return { ok: false, message: "Couldn't save that smart reminder." };

      // Human-readable confirmation — spell out the auto-act explicitly.
      const whenBits: string[] = [];
      if (trigger.byHour != null) whenBits.push(`from ${String(trigger.byHour).padStart(2, "0")}:00`);
      if (trigger.daysBeforeDeadline != null) whenBits.push(`${trigger.daysBeforeDeadline}d before deadline`);
      if (trigger.onOverdue) whenBits.push("once overdue");
      const when = whenBits.length ? whenBits.join(" · ") : "each day";
      const whoBits: string[] = [];
      if (audience.notifyOwner) whoBits.push("you");
      if (audience.notifyDirectors) whoBits.push("directors");
      if (audience.warnPerson) whoBits.push("the person");
      if (extraNames.length) whoBits.push(extraNames.join(", "));
      const who = whoBits.length ? `notify ${whoBits.join(", ")}` : "";
      const doBits: string[] = [];
      if (actions.autoAct && actions.postUpdate) doBits.push("auto-post an update");
      if (actions.autoAct && actions.setStatus) doBits.push(`set status to ${actions.setStatus}`);
      if (actions.autoAct && actions.sendChannel) doBits.push(`send by ${actions.sendChannel} (if auto-send is on)`);
      const act = doBits.length ? ` and AUTOMATICALLY ${doBits.join(", ")}` : "";
      const sep = who && act ? " —" : "";

      return {
        ok: true,
        message: `Smart reminder set for ${scopeLabel}: ${when}, if ${condition.replace(/_/g, " ")}, ${who}${sep}${act}.`,
        redirect: scope.taskId ? undefined : "/settings",
        undo: { kind: "ori.automation.create", payload: { ruleId: data.id as number } },
      };
    },
  },
];
