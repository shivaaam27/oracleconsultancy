import "server-only";
import type { ToolDef } from "@/lib/ori/tools";
import { str, resolveCompany, resolvePerson } from "@/lib/ori/tools";
import {
  createWatcher,
  listWatchers,
  deleteWatcher,
  isOpenTaskStatus,
  type WatchConfig,
} from "@/lib/ori/watchers";

/**
 * WATCHER TOOLS — ORI turns "tell me the moment X happens" into an event-driven
 * standing alert. Watchers piggyback on the per-write index hook (no cron, no AI
 * tokens): the instant a matching write lands, ORI notifies you.
 *
 * Spread WATCHER_TOOLS into TOOLS in tools.ts so they register into TOOL_BY_NAME.
 * Undo kinds ori.watcher.create / ori.watcher.delete live in undo-handlers/ori.ts.
 */

const TASK_STATUSES = "Not Started | In Progress | Under Review | Blocked | Waiting External | Escalated";

export const WATCHER_TOOLS: ToolDef[] = [
  {
    name: "create_watcher",
    tier: 2,
    description:
      "Set an EVENT-DRIVEN watcher — an alert that fires the MOMENT something happens (not on a schedule). Three kinds: a task's status becomes a value (e.g. any task goes Blocked or Escalated, optionally scoped to one company); a task goes overdue; or a tracked document is about to expire. Great for 'tell me the moment PES raises a blocker' or 'alert me if any task goes overdue'.",
    params: {
      condition: {
        type: "string",
        required: true,
        description:
          "What to watch: 'task_status_becomes' | 'task_overdue' | 'document_expiring'.",
      },
      status: {
        type: "string",
        required: false,
        description: `For task_status_becomes: which status to watch for — ${TASK_STATUSES}.`,
      },
      company: {
        type: "string",
        required: false,
        description: "Optional — only fire for this portfolio company (by name). Omit = all companies.",
      },
      daysBefore: {
        type: "number",
        required: false,
        description: "For document_expiring: how many days before expiry to alert (default 14).",
      },
      notifyPerson: {
        type: "string",
        required: false,
        description: "Optional — who to alert, by name. Omit = alert the owner (you).",
      },
    },
    async run(args) {
      const raw = str(args.condition).toLowerCase().replace(/[\s-]+/g, "_");
      const condition =
        raw.includes("overdue") ? "task_overdue"
        : raw.includes("expir") || raw.includes("document") ? "document_expiring"
        : raw.includes("status") || raw.includes("becomes") ? "task_status_becomes"
        : "";
      if (!condition) {
        return { ok: false, message: "What should I watch for — a task status change, a task going overdue, or a document expiring?" };
      }

      const cfg: WatchConfig = {
        entityType: condition === "document_expiring" ? "document" : "task",
        condition,
      };

      // Optional company scope.
      let scopeLabel = "";
      if (str(args.company)) {
        const c = await resolveCompany(str(args.company));
        if (!c) return { ok: false, message: `Couldn't match a company called "${str(args.company)}".` };
        cfg.companyId = c.id;
        scopeLabel = ` for ${c.name}`;
      }

      // Optional recipient.
      let whoLabel = "you";
      if (str(args.notifyPerson)) {
        const p = await resolvePerson(str(args.notifyPerson));
        if (!p) return { ok: false, message: `Couldn't find an active person called "${str(args.notifyPerson)}" to alert.` };
        cfg.notifyPersonId = p.id;
        whoLabel = p.name;
      }

      let label: string;
      if (condition === "task_status_becomes") {
        const status = str(args.status);
        if (!status) return { ok: false, message: `Which status should I watch for — ${TASK_STATUSES}?` };
        if (!isOpenTaskStatus(status)) return { ok: false, message: `"${status}" isn't a status I can watch. Use one of: ${TASK_STATUSES}.` };
        cfg.value = status;
        label = `any task${scopeLabel} becomes ${status}`;
      } else if (condition === "task_overdue") {
        label = `any task${scopeLabel} goes overdue`;
      } else {
        const daysBefore = Math.max(0, Math.round(Number(args.daysBefore) || 14));
        cfg.daysBefore = daysBefore;
        label = `a document${scopeLabel} is within ${daysBefore} day${daysBefore === 1 ? "" : "s"} of expiry`;
      }
      cfg.label = label;

      const ruleId = await createWatcher(cfg);
      if (!ruleId) return { ok: false, message: "Couldn't save that watcher." };
      return {
        ok: true,
        message: `Watching: I'll alert ${whoLabel} the moment ${label}.`,
        undo: { kind: "ori.watcher.create", payload: { ruleId } },
      };
    },
  },
  {
    name: "list_watchers",
    tier: 1,
    description: "List the active ORI watchers (event-driven 'tell me the moment X happens' alerts), with their id so you can remove one.",
    params: {},
    async run() {
      const rows = await listWatchers();
      if (rows.length === 0) return { ok: true, message: "There are no active watchers." };
      const lines = rows.map((r) => `#${r.id} — ${r.config.label ?? r.config.condition}`);
      return { ok: true, message: `Active watchers (${rows.length}):\n${lines.join("\n")}` };
    },
  },
  {
    name: "delete_watcher",
    tier: 2,
    description: "Remove an ORI watcher by its id (from list_watchers). It stops alerting.",
    params: {
      watcherId: { type: "number", required: true, description: "The watcher id (see list_watchers)." },
    },
    async run(args) {
      const id = Number(args.watcherId);
      if (!Number.isFinite(id) || id <= 0) return { ok: false, message: "Which watcher — give its id (from list_watchers)?" };
      const ok = await deleteWatcher(id);
      if (!ok) return { ok: false, message: `Couldn't remove watcher #${id}.` };
      return { ok: true, message: `Removed watcher #${id}.`, undo: { kind: "ori.watcher.delete", payload: { ruleId: id } } };
    },
  },
];
