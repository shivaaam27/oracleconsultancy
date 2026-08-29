// The tool registry — the single source of truth for what an assistant can do
// through /api/mcp.
//
// FORWARD RULE: to add a tool, add ONE entry here. Name, description, input
// schema, the capability it needs and the handler live together; the endpoint
// derives everything else. Same idea as the entity registry (lib/entity-registry.ts)
// — one definition, no wiring in three places.
//
// STAGE 2 — reads, plus writes (memory/mcp_stage2_safe_writes.md). The two lines
// that must not move:
//
//   MCP NEVER DELETES.
//   MCP NEVER SENDS A MESSAGE — except a meeting/event invitation, which the
//   owner opened deliberately in Aug 2026.
//
// Everything else the owner can do in the command centre is available here.
// Anything outbound that isn't an invitation becomes an Outbox draft. Every write
// tool sets `write: true` below — that flag is what marks it non-read-only to the
// client and what puts it behind the care language in the server instructions.
//
// Server-only.

import { z } from "zod";
import { sb } from "@/db/supabase";
import type { CapabilityKey } from "@/lib/portal-permissions";
import { companyScope } from "@/lib/portal-auth";
import { callerMayWrite, type McpCaller } from "@/lib/mcp/auth";
import {
  mcpCreateTask, mcpAddTaskUpdate, mcpCreateEvent, mcpCreateDocument,
  mcpAssignAsset, mcpDraftMessage, mcpUndoLast,
  mcpArchiveTask, mcpArchiveDocument, mcpBulkTaskAction,
  mcpTaskDetail, mcpUpdateTask, mcpManageTask,
  PRIORITIES, CATEGORIES, OPEN_STATUSES, ALL_STATUSES, BULK_ACTIONS,
  RISKS, ESCALATIONS, ACCOUNTABILITY, TASK_ACTIONS,
} from "@/lib/mcp/writes";
import {
  mcpListRecords, mcpManageTodo, mcpMarkAttendance, mcpManagePipeline, mcpDraftAnnouncement,
  RECORD_TYPES, ATTENDANCE_STATUSES, PIPELINE_STAGE_NAMES,
} from "@/lib/mcp/records";
import { getAllTasks, computeCompanyKpis, computeGlobalKpis, type TaskRow } from "@/lib/queries";
import { getAllPeopleWithWorkload, getPersonDetail } from "@/lib/people-queries";
import { teamAttendanceToday } from "@/lib/attendance";
import { listCalendarEvents } from "@/lib/calendar";
import { listDocuments } from "@/lib/documents";
import { getBrief } from "@/lib/director-brief";
import { unifiedSearch } from "@/lib/search";
import { mcpNotes, mcpNoteWrite } from "@/lib/mcp/notes";
import { mcpOps, OPS_TYPES } from "@/lib/mcp/ops";

/* --------------------------------------------------------------- *
 * Tool shape
 * --------------------------------------------------------------- */

export type McpTool = {
  name: string;
  title: string;
  description: string;
  /** Zod schema for the arguments. Use `z.object({})` for none. */
  schema: z.ZodType;
  /**
   * Capability this tool requires of a STAFF caller. Undefined = owner-only.
   * The owner bypasses capability checks (they configure them); a staff caller
   * must hold the key in their resolved `caps`.
   */
  capability?: CapabilityKey;
  /**
   * True if this tool CHANGES something. Reads leave it undefined.
   *
   * Not a permission — the capability above is. This drives the `readOnlyHint`
   * annotation the client sees and the "check before you act" wording in the
   * server instructions, so an assistant treats a write like a write.
   */
  write?: boolean;
  /** Returns anything JSON-serialisable; the endpoint stringifies it. */
  run: (args: Record<string, unknown>, caller: McpCaller) => Promise<unknown>;
};

/**
 * May this caller use this tool?
 *
 * Called TWICE by design: once to decide what to advertise, and again inside the
 * endpoint before a call runs. The first is tidiness — it keeps tools a caller
 * can't use out of the model's context. The second is the actual security,
 * because a key can be pointed at a tool name directly without ever reading the
 * advertised list. See memory/mcp_plan.md.
 */
export function callerMayUse(tool: McpTool, caller: McpCaller): boolean {
  // A connection that was only granted `cos.read` gets no write tools, whoever
  // is behind it. Checked BEFORE the capability, because a scope the person
  // approved is a ceiling on top of what their role would otherwise allow.
  if (tool.write && !callerMayWrite(caller)) return false;
  if (caller.kind === "owner") return true;
  if (!tool.capability) return false; // owner-only tool
  return caller.person.caps[tool.capability] === true;
}

/* --------------------------------------------------------------- *
 * Scope helpers
 * --------------------------------------------------------------- */

/**
 * The companies this caller may see: null = all of them.
 *
 * The owner is unrestricted. A staff caller goes through the SAME
 * `companyScope()` the portal uses, so their reach here can never exceed their
 * reach on the web. Applied to the DATA, never left to the wording of a request.
 */
async function scopeFor(caller: McpCaller): Promise<number[] | null> {
  if (caller.kind === "owner") return null;
  return await companyScope(caller.person);
}

/** Narrow a task list to the caller's companies. */
async function scopedTasks(caller: McpCaller): Promise<TaskRow[]> {
  const rows = await getAllTasks();
  const scope = await scopeFor(caller);
  if (scope == null) return rows;
  const allowed = new Set(scope);
  return rows.filter((t) => allowed.has(t.companyId));
}

/* --------------------------------------------------------------- *
 * Compact shapes — send what's useful, not whole rows
 * --------------------------------------------------------------- */

// Full rows would burn the context window for no gain: an assistant answering
// "what's overdue?" needs a code, a title and a date, not 40 columns.
const slimTask = (t: TaskRow) => ({
  code: t.code,
  title: t.actionItem,
  company: t.companyName,
  status: t.status,
  priority: t.priority,
  owner: t.owner,
  deadline: isoDay(t.deadline),
  flag: t.flag,
  daysToDeadline: t.daysToDeadline,
});

const OPEN_EXCLUDED = new Set(["Completed", "Closed"]);
const isOpen = (t: TaskRow) => !OPEN_EXCLUDED.has(t.status);

/** yyyy-mm-dd from a Date, an ISO string, or nothing. `String(date).slice(0,10)`
 *  is NOT equivalent — on a Date it yields "Tue Dec 31", which is useless to a
 *  reader and unsortable. */
function isoDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/* --------------------------------------------------------------- *
 * The tools
 * --------------------------------------------------------------- */

export const MCP_TOOLS: McpTool[] = [
  {
    name: "search_cos",
    title: "Search COS",
    description:
      "Search everything in COS at once — tasks, people, companies, documents, vendors, assets, " +
      "governance records. Use this when you don't know which specific list something is in, or " +
      "when the person names something without saying what kind of thing it is.",
    schema: z.object({
      query: z.string().min(2).describe("What to look for, in plain words"),
      limit: z.number().int().min(1).max(25).optional().describe("Max results per type (default 8)"),
      includeHistory: z.boolean().optional().describe("Include archived/historic records (default false)"),
    }),
    capability: "oriAsk",
    run: async (args) => {
      const { query, limit, includeHistory } = args as { query: string; limit?: number; includeHistory?: boolean };
      const hits = await unifiedSearch(query, limit ?? 8, includeHistory ?? false);
      return hits.map((h) => ({ type: h.type, title: h.title, subtitle: h.subtitle, badge: h.badge, snippet: h.snippet }));
    },
  },

  {
    name: "list_tasks",
    title: "List tasks",
    description:
      "List tasks, newest deadlines first. Filter by company name, status, or overdue-only. " +
      "'Open' means anything except Completed and Closed.",
    schema: z.object({
      company: z.string().optional().describe("Company name or part of it, e.g. 'DSC Ltd'"),
      status: z.string().optional().describe("Exact status, e.g. 'Blocked', 'In Progress'"),
      openOnly: z.boolean().optional().describe("Only tasks that aren't Completed/Closed (default true)"),
      overdueOnly: z.boolean().optional().describe("Only tasks past their deadline"),
      limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 40)"),
    }),
    capability: "navTasks",
    run: async (args, caller) => {
      const { company, status, openOnly, overdueOnly, limit } = args as {
        company?: string; status?: string; openOnly?: boolean; overdueOnly?: boolean; limit?: number;
      };
      let rows = await scopedTasks(caller);
      if (openOnly !== false) rows = rows.filter(isOpen);
      if (company) {
        const needle = company.toLowerCase();
        rows = rows.filter((t) => t.companyName.toLowerCase().includes(needle));
      }
      if (status) rows = rows.filter((t) => t.status.toLowerCase() === status.toLowerCase());
      if (overdueOnly) rows = rows.filter((t) => t.flag === "overdue" || t.flag === "escalate-now");
      rows.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
      return { count: rows.length, tasks: rows.slice(0, limit ?? 40).map(slimTask) };
    },
  },

  {
    name: "company_kpis",
    title: "Company health",
    description:
      "Task counts per company plus a portfolio total — open, overdue, due soon, critical, blocked. " +
      "Use this for 'how are we doing' questions rather than listing every task.",
    schema: z.object({}),
    capability: "navInsights",
    run: async (_args, caller) => {
      const rows = await scopedTasks(caller);
      return { portfolio: computeGlobalKpis(rows), companies: computeCompanyKpis(rows) };
    },
  },

  {
    name: "list_people",
    title: "List people",
    description:
      "Everyone active, with how much work each is carrying. Use to answer 'who is free', " +
      "'who has the most on', or to find someone's id before calling get_person.",
    schema: z.object({
      search: z.string().optional().describe("Filter by name, role or company"),
    }),
    capability: "navTasks",
    run: async (args) => {
      const { search } = args as { search?: string };
      const people = await getAllPeopleWithWorkload();
      const needle = search?.toLowerCase().trim();
      const filtered = needle
        ? people.filter((p) =>
            [p.name, p.role ?? "", p.companyName ?? "", p.departmentName ?? ""]
              .join(" ").toLowerCase().includes(needle))
        : people;
      return filtered.map((p) => ({
        id: p.id, name: p.name, role: p.role,
        company: p.companyName, department: p.departmentName,
        open: p.workload.open, overdue: p.workload.overdue, blocked: p.workload.blocked,
      }));
    },
  },

  {
    name: "get_person",
    title: "Person detail",
    description:
      "One person in full — their role, companies, tasks and documents. Needs the numeric id, " +
      "which list_people or search_cos will give you.",
    schema: z.object({ id: z.number().int().describe("Person id") }),
    capability: "navTasks",
    run: async (args) => {
      const { id } = args as { id: number };
      const person = await getPersonDetail(id);
      if (!person) return { found: false };
      return { found: true, person };
    },
  },

  {
    name: "attendance_today",
    title: "Attendance today",
    description:
      "Who is in, out, on leave or absent today. Covers everyone active unless you pass ids.",
    schema: z.object({
      personIds: z.array(z.number().int()).optional().describe("Limit to these people"),
    }),
    capability: "navTasks",
    run: async (args) => {
      const { personIds } = args as { personIds?: number[] };
      let ids = personIds;
      if (!ids?.length) {
        const { data } = await sb.from("people").select("id").eq("active", true);
        ids = (data ?? []).map((r) => r.id as number);
      }
      const rows = await teamAttendanceToday(ids);
      const summary: Record<string, number> = {};
      for (const r of rows) summary[r.status ?? "Not marked"] = (summary[r.status ?? "Not marked"] ?? 0) + 1;
      return { date: new Date().toISOString().slice(0, 10), summary, people: rows };
    },
  },

  {
    name: "list_events",
    title: "Calendar",
    description:
      "Calendar events in a date window. Defaults to the next 14 days. Dates are yyyy-mm-dd.",
    schema: z.object({
      from: z.string().optional().describe("Start date, yyyy-mm-dd (default today)"),
      to: z.string().optional().describe("End date, yyyy-mm-dd (default 14 days out)"),
    }),
    capability: "navTasks",
    run: async (args, caller) => {
      const { from, to } = args as { from?: string; to?: string };
      const start = from ? new Date(`${from}T00:00:00Z`) : new Date();
      const end = to ? new Date(`${to}T23:59:59Z`) : new Date(Date.now() + 14 * 86400000);
      const events = await listCalendarEvents({ from: start.toISOString(), to: end.toISOString() });
      const scope = await scopeFor(caller);
      const allowed = scope == null ? null : new Set(scope);
      return events
        // A company-less event (a personal diary entry) is visible to the owner
        // only — a scoped caller has no company claim to it.
        .filter((e) => allowed == null || (e.companyId != null && allowed.has(e.companyId)))
        .map((e) => ({
          title: e.title, start: e.startAt, end: e.endAt, allDay: e.allDay,
          location: e.location, meetLink: e.meetLink,
          attendees: e.attendees.map((a) => a.name),
        }));
    },
  },

  /* Notes — Phase 7 of memory/notes_module_plan.md. TWO tools, grouped by
     subject rather than one per button, as this file requires: every description
     sits in every conversation's prompt.
     ⚠️ Both are OWNER-ONLY and say so twice — no `capability` here (undefined =
     owner-only), and the handlers refuse a staff caller outright. That belt and
     braces is deliberate: a note may hold what the owner thinks about a member of
     staff, and no permission toggle should be able to hand it over. */
  {
    name: "notes",
    title: "Read the owner's notes",
    description:
      "The owner's private notes: list the most recent, read one in full, or search them. " +
      "`get` also returns what the note links to — the tasks, people, companies and documents it mentions. " +
      "These are personal notes, not shared records; they are the owner's own and no member of staff can see them.",
    schema: z.object({
      action: z.enum(["list", "get", "search"]).describe("list the recent ones, get one by id, or search"),
      noteId: z.number().int().optional().describe("For 'get' — the note's id"),
      query: z.string().optional().describe("For 'search' — what to look for"),
      includeArchived: z.boolean().optional().describe("Include notes taken off the shelf (default false)"),
      limit: z.number().int().optional().describe("How many to return, up to 50"),
    }),
    run: async (args, caller) => await mcpNotes(caller, args as Parameters<typeof mcpNotes>[1]),
  },

  {
    name: "note_write",
    title: "Make a note, or add to one",
    description:
      "Write in the owner's notes. 'create' starts a new one; 'append' ADDS to the end of an existing " +
      "note and never replaces what is already there — this is what \"add that to Monday's note\" means. " +
      "'archive' takes a note off the shelf, which is the only form of removal there is: nothing is " +
      "ever deleted, and archiving is undone by calling it again with archived: false. " +
      "Say the note id back to the owner afterwards.",
    schema: z.object({
      action: z.enum(["create", "append", "archive"]).describe("What to do"),
      noteId: z.number().int().optional().describe("For 'append' and 'archive'"),
      title: z.string().optional().describe("For 'create' — optional; a note may be untitled"),
      text: z.string().optional().describe("The words. Blank lines separate paragraphs."),
      archived: z.boolean().optional().describe("For 'archive' — default true; false puts it back"),
    }),
    write: true,
    run: async (args, caller) => await mcpNoteWrite(caller, args as Parameters<typeof mcpNoteWrite>[1]),
  },

  {
    name: "list_documents",
    title: "Documents",
    description:
      "Filed documents — licences, contracts, certificates, permits. Use expiringWithinDays to " +
      "answer 'what needs renewing'; it includes anything ALREADY expired, since those need " +
      "attention most. Returns details only, never file contents.",
    schema: z.object({
      expiringWithinDays: z.number().int().min(1).max(365).optional().describe("Expiring within N days, including already-expired"),
      search: z.string().optional().describe("Filter by title, type or issuer"),
      limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 40)"),
    }),
    capability: "navTasks",
    run: async (args, caller) => {
      const { expiringWithinDays, search, limit } = args as {
        expiringWithinDays?: number; search?: string; limit?: number;
      };
      let docs = await listDocuments();
      const scope = await scopeFor(caller);
      if (scope != null) {
        const allowed = new Set(scope);
        docs = docs.filter((d) => d.companyId != null && allowed.has(d.companyId));
      }
      if (expiringWithinDays != null) {
        const cutoff = Date.now() + expiringWithinDays * 86400000;
        docs = docs.filter((d) => d.expiryDate != null && new Date(d.expiryDate).getTime() <= cutoff);
      }
      if (search) {
        const needle = search.toLowerCase();
        docs = docs.filter((d) =>
          [d.title, d.docType ?? "", d.issuer ?? ""].join(" ").toLowerCase().includes(needle));
      }
      return {
        count: docs.length,
        documents: docs.slice(0, limit ?? 40).map((d) => ({
          id: d.id, title: d.title, category: d.category, type: d.docType,
          issuer: d.issuer, reference: d.referenceNo,
          expires: isoDay(d.expiryDate),
        })),
      };
    },
  },

  {
    name: "director_brief",
    title: "Director brief",
    description:
      "The portfolio brief — the same report as the Director Brief page. Use for 'how is the " +
      "business doing' or 'summarise the month'.",
    schema: z.object({
      period: z.enum(["month", "last-month", "quarter", "year"]).optional().describe("Default month"),
    }),
    capability: "directorBrief",
    run: async (args, caller) => {
      const { period } = args as { period?: "month" | "last-month" | "quarter" | "year" };
      const scope = await scopeFor(caller);
      return await getBrief(new Date(), period ?? "month", scope);
    },
  },

  /* =============================================================== *
   * WRITES (stage 2). Read the header of lib/mcp/writes.ts before
   * adding another one — the tier rules are not negotiable.
   * =============================================================== */

  {
    name: "create_task",
    title: "Create a task",
    description:
      "Raise ONE new task, with any of the fields the task form has. Give the company and a " +
      "title; everything else is optional. People and departments must already exist — if a " +
      "name doesn't match anybody this fails rather than inventing a member of staff. " +
      "Tell the person what you created, including the task code you get back.",
    schema: z.object({
      company: z.string().describe("Company name or its two-letter prefix, e.g. 'DSC Ltd' or 'DS'"),
      title: z.string().min(3).describe("What actually needs doing, in a line"),
      assignees: z.array(z.string()).optional().describe("Names of existing people to make responsible"),
      deadline: z.string().optional().describe("Due date, yyyy-mm-dd"),
      priority: z.enum(PRIORITIES).optional().describe("How soon it matters. Default Medium"),
      status: z.enum(OPEN_STATUSES).optional().describe("Starting status, default Not Started"),
      category: z.enum(CATEGORIES).optional(),
      note: z.string().optional().describe("An opening instruction or context for whoever picks it up"),
      department: z.string().optional().describe("An EXISTING department, e.g. 'Finance'"),
      risk: z.enum(RISKS).optional().describe("How bad it is if this slips — separate from priority, which is how soon"),
      escalation: z.enum(ESCALATIONS).optional().describe("Yes also starts the task in the Escalated status"),
      meetingDate: z.string().optional().describe("The meeting this came out of, yyyy-mm-dd"),
      comments: z.string().optional().describe("Standing background on the task — not the same as `note`, which is the first timeline entry"),
      accountability: z.enum(ACCOUNTABILITY).optional()
        .describe("'shared' (default — everyone on it carries the overdue) or 'lead' (the FIRST name carries it alone; needs at least one assignee)"),
      repeat: z.object({
        cadence: z.enum(["weekly", "monthly"]),
        weekdays: z.array(z.number().int().min(0).max(6)).optional().describe("Weekly only. 0 = Sunday … 6 = Saturday"),
        dayOfMonth: z.number().int().min(1).max(31).optional().describe("Monthly only"),
      }).optional().describe("A STANDING rule that raises this task again on the days you name. Today's task is created either way — say that you set up a repeat."),
      requiresAttachment: z.boolean().optional()
        .describe("Completing it will REFUSE without a file attached. Use when somebody asks for proof — a receipt, a signed form, a photograph."),
    }),
    capability: "createTasks",
    write: true,
    run: async (args, caller) => await mcpCreateTask(caller, args as Parameters<typeof mcpCreateTask>[1]),
  },

  {
    name: "add_task_update",
    title: "Post a task update",
    description:
      "Add an update to an existing task, and optionally move its status — including marking it " +
      "Completed or Closed. Always write what actually happened in the note; the update is the " +
      "record of why the status moved.",
    schema: z.object({
      taskCode: z.string().describe("Task code, e.g. DS-014"),
      note: z.string().min(2).describe("The update, in plain words"),
      newStatus: z.enum(ALL_STATUSES).optional().describe("Move the task to this status"),
    }),
    capability: "messageOnTasks",
    write: true,
    run: async (args, caller) => await mcpAddTaskUpdate(caller, args as Parameters<typeof mcpAddTaskUpdate>[1]),
  },

  {
    // The read that pairs with update_task. list_tasks is deliberately slim — it
    // is a list — but an assistant asked to change a field has to be able to see
    // that field first, and to quote back what it is about to overwrite.
    name: "get_task",
    title: "Read one task in full",
    description:
      "Everything on ONE task: every field, who it's for and who leads, whether it's blocked " +
      "and on whom, its recent conversation (with the id of each update) and, if you ask, its " +
      "change history. Use this before update_task so you can say what you're changing FROM.",
    schema: z.object({
      taskCode: z.string().describe("Task code, e.g. DS-014"),
      updates: z.boolean().optional().describe("Include the conversation, newest first (default true)"),
      history: z.boolean().optional().describe("Include the audit trail — who changed what, when (default false)"),
    }),
    capability: "navTasks",
    run: async (args, caller) => await mcpTaskDetail(caller, args as Parameters<typeof mcpTaskDetail>[1]),
  },

  {
    name: "update_task",
    title: "Change a task",
    description:
      "Edit ONE task. Send ONLY the fields you are changing — anything you leave out is left " +
      "exactly as it is. Read it with get_task first so you can say what moved and from what. " +
      "Two things to be careful of: `assignees` REPLACES the whole list (so include the people " +
      "already on it, or you are taking them off), and `company` moves the task and RE-ISSUES " +
      "its code, so quote the new code back. Pass null to clear a deadline, risk, category, " +
      "meeting date, department or comments. To post an update or move the status with a note, " +
      "use add_task_update — that leaves a record of why.",
    schema: z.object({
      taskCode: z.string().describe("Task code, e.g. DS-014"),
      title: z.string().min(3).optional().describe("A new one-line description of the work"),
      company: z.string().optional().describe("Move it to this company — the task code is re-issued under the new prefix"),
      department: z.string().nullable().optional().describe("An EXISTING department, or null to clear it"),
      status: z.enum(ALL_STATUSES).optional().describe("Prefer add_task_update when the move deserves an explanation"),
      priority: z.enum(PRIORITIES).optional(),
      risk: z.enum(RISKS).nullable().optional().describe("How bad if it slips — null clears it"),
      escalation: z.enum(ESCALATIONS).optional().describe("Yes also moves it to the Escalated status"),
      category: z.enum(CATEGORIES).nullable().optional(),
      deadline: z.string().nullable().optional().describe("yyyy-mm-dd, or null for no deadline"),
      meetingDate: z.string().nullable().optional().describe("yyyy-mm-dd, or null"),
      comments: z.string().nullable().optional().describe("Standing background on the task"),
      assignees: z.array(z.string()).optional().describe("REPLACES everyone on the task with these existing people"),
      accountability: z.enum(ACCOUNTABILITY).optional()
        .describe("'shared' (everyone on it carries the overdue) or 'lead' (the first name carries it alone)"),
      requiresAttachment: z.boolean().optional()
        .describe("Whether completing it refuses without a file attached"),
      reason: z.string().optional().describe("Why — recorded against every field this call changes"),
    }),
    capability: "manageAnyTask",
    write: true,
    run: async (args, caller) => await mcpUpdateTask(caller, args as Parameters<typeof mcpUpdateTask>[1]),
  },

  {
    // ⚠️ ONE tool for the controls that are not fields — nine of these as
    // separate entries would put nine descriptions in every conversation.
    name: "manage_task",
    title: "Task controls",
    description:
      "The handful of task controls that aren't fields. 'block' records that a task is waiting " +
      "on a named person for a stated reason — it goes Blocked and its overdue is suspended for " +
      "everybody until 'unblock'. 'part_done' / 'part_reopened' mark ONE person's share of a " +
      "shared task finished, without finishing the task. The rest correct the conversation: " +
      "'edit_update' rewrites an update (the original wording is kept), 'pin_update' / " +
      "'unpin_update' pin one to the top, and 'remove_update' takes one off the timeline — that " +
      "is NOT a delete, the row stays and 'restore_update' puts it straight back. Update ids " +
      "come from get_task.",
    schema: z.object({
      action: z.enum(TASK_ACTIONS),
      taskCode: z.string().optional().describe("Task code — for block, unblock, part_done, part_reopened"),
      person: z.string().optional().describe("Who it's waiting on, or whose part is done"),
      reason: z.string().optional().describe("Why it's blocked, or why an update was changed or taken down"),
      note: z.string().optional().describe("What resolved it, for unblock"),
      updateId: z.number().int().optional().describe("The update to act on — get_task lists these"),
      body: z.string().optional().describe("The corrected wording, for edit_update"),
    }),
    capability: "manageAnyTask",
    write: true,
    run: async (args, caller) => await mcpManageTask(caller, args as Parameters<typeof mcpManageTask>[1]),
  },

  {
    name: "create_event",
    title: "Put something in the diary",
    description:
      "Create a meeting or event. It reaches the diary and Google, and — this is the ONE thing " +
      "here that emails anybody — an invitation is sent to attendees who have an email address. " +
      "So be sure of the people and the time before you call it, and say afterwards who was " +
      "invited. Pass sendInvitations: false to pencil something in without telling anyone. " +
      "Times are Dar es Salaam (EAT). Use 'yyyy-mm-dd HH:MM', or just 'yyyy-mm-dd' for all day. " +
      "documentIds attaches already-filed papers (a ticket, an agenda) — they go OUT on the " +
      "invitation email, so find the id with list_documents and be certain it is the right one.",
    schema: z.object({
      title: z.string().min(2),
      start: z.string().describe("'2026-08-20 09:00' (EAT) or '2026-08-20' for an all-day event"),
      end: z.string().optional().describe("Same format as start"),
      allDay: z.boolean().optional(),
      company: z.string().optional().describe("Which company this is for"),
      location: z.string().optional(),
      description: z.string().optional(),
      attendees: z.array(z.string()).optional().describe("Names of existing people to invite"),
      sendInvitations: z.boolean().optional().describe("Default true — set false to add it quietly, inviting nobody"),
      documentIds: z
        .array(z.number())
        .optional()
        .describe("Ids of filed documents to attach — they are EMAILED to attendees. Owner key only; get ids from list_documents"),
    }),
    capability: "createEvents",
    write: true,
    run: async (args, caller) => await mcpCreateEvent(caller, args as Parameters<typeof mcpCreateEvent>[1]),
  },

  {
    name: "create_document",
    title: "File a document record",
    description:
      "Record a document in the library — a licence, contract, certificate or permit — so its " +
      "expiry is tracked. This records the DETAILS only; no file is attached and nothing is read " +
      "or classified for you. Never guess a date or a reference number: leave it out and ask.",
    schema: z.object({
      title: z.string().min(2).describe("What the document is called"),
      company: z.string().optional().describe("The company it belongs to"),
      person: z.string().optional().describe("The person it belongs to (a passport, a permit)"),
      category: z.string().optional().describe("Licence, Contract, Certificate, Registration, Insurance, Lease, Permit, Immigration, Passport, Tax, Banking, HR, Legal, Operations, Travel"),
      docType: z.string().optional().describe("The specific type, e.g. 'Business Licence'"),
      issuer: z.string().optional().describe("Who issued it, e.g. 'TRA'"),
      referenceNo: z.string().optional(),
      issueDate: z.string().optional().describe("yyyy-mm-dd"),
      expiryDate: z.string().optional().describe("yyyy-mm-dd — this is what drives renewal reminders"),
      notes: z.string().optional(),
    }),
    // Owner-only: no portal capability covers the document library.
    write: true,
    run: async (args, caller) => await mcpCreateDocument(caller, args as Parameters<typeof mcpCreateDocument>[1]),
  },

  {
    name: "assign_asset",
    title: "Hand an asset to someone",
    description:
      "Record that a piece of equipment is now held by a person. Closes whoever had it before " +
      "and opens a new entry in its history. Find the asset by tag, name or serial number.",
    schema: z.object({
      asset: z.string().describe("Asset tag, name or serial number"),
      person: z.string().describe("Who is taking it — must be an existing active person"),
      notes: z.string().optional().describe("Condition, accessories, anything worth recording"),
    }),
    // Owner-only: the asset register has no portal capability.
    write: true,
    run: async (args, caller) => await mcpAssignAsset(caller, args as Parameters<typeof mcpAssignAsset>[1]),
  },

  {
    name: "draft_message",
    title: "Draft a message (never sends)",
    description:
      "Write a message to someone and save it in the Outbox as a DRAFT. It is not sent, and you " +
      "cannot send it — a person opens the Outbox and presses send. Always say this when you " +
      "use it, so nobody believes a message has gone out when it hasn't.",
    schema: z.object({
      person: z.string().describe("Who it's for — an existing active person"),
      body: z.string().min(2).describe("The message itself, ready to send as written"),
      subject: z.string().optional().describe("Email subject line"),
      channel: z.enum(["WHATSAPP", "EMAIL", "SMS"]).optional().describe("Default is their preferred channel"),
    }),
    capability: "bulkOutreach",
    write: true,
    run: async (args, caller) => await mcpDraftMessage(caller, args as Parameters<typeof mcpDraftMessage>[1]),
  },

  {
    name: "archive_task",
    title: "Archive or restore a task",
    description:
      "File a task out of the way, or bring one back. Archiving is NOT deleting — the task, its " +
      "history and its conversation all stay, it simply leaves the active list. Use this when " +
      "asked to get rid of a task; you cannot delete anything, and archiving is what people mean.",
    schema: z.object({
      taskCode: z.string().describe("Task code, e.g. DS-014"),
      archived: z.boolean().optional().describe("Default true; pass false to restore it"),
    }),
    capability: "manageAnyTask",
    write: true,
    run: async (args, caller) => await mcpArchiveTask(caller, args as Parameters<typeof mcpArchiveTask>[1]),
  },

  {
    name: "archive_document",
    title: "Archive or restore a document",
    description:
      "File a document out of the library, or bring it back. Like a task, archiving keeps the " +
      "record and its file — nothing is deleted. Needs the numeric id from list_documents.",
    schema: z.object({
      documentId: z.number().int().describe("Document id from list_documents"),
      archived: z.boolean().optional().describe("Default true; pass false to restore it"),
    }),
    // Owner-only: the document library has no portal capability.
    write: true,
    run: async (args, caller) => await mcpArchiveDocument(caller, args as Parameters<typeof mcpArchiveDocument>[1]),
  },

  {
    name: "bulk_task_action",
    title: "Change several tasks at once",
    description:
      "Apply ONE change to a list of tasks — set a status or priority, postpone deadlines, " +
      "escalate, close, or post the same update on all of them. Up to 25 at a time, and every " +
      "code must be one you can reach or the whole call is refused. There is NO single undo for " +
      "this, so list the tasks back to the person afterwards. It cannot delete.",
    schema: z.object({
      taskCodes: z.array(z.string()).min(1).max(25).describe("The task codes to change"),
      action: z.enum(BULK_ACTIONS).describe("What to do to all of them"),
      value: z.string().optional().describe("The status (for 'status') or priority (for 'priority')"),
      days: z.number().int().optional().describe("Days to push the deadline by, for 'postpone'"),
      note: z.string().optional().describe("The update body, for 'update'"),
    }),
    capability: "bulkTaskActions",
    write: true,
    run: async (args, caller) => await mcpBulkTaskAction(caller, args as Parameters<typeof mcpBulkTaskAction>[1]),
  },

  /* =============================================================== *
   * The wider modules. ONE reading tool for twelve of them (see the
   * header of lib/mcp/records.ts for why it isn't twelve tools), plus
   * a typed tool for each of the four that are worth writing to.
   * =============================================================== */

  {
    // ⚠️ ONE tool for the whole trading module, with a `type` argument — every
    // description here sits in every conversation's prompt, so five tools for
    // one module would cost five descriptions (the MCP forward rule).
    //
    // ⚠️ READ ONLY. The figures come from order lines several people type by
    // hand, and a write on the wrong PO is worse than a question.
    name: "pes_trading",
    title: "The PES trading and import business",
    description:
      "Read the PES trading module — buying engineering parts, mostly imported, and selling " +
      "them to the mines. Pick a type. " +
      "REPORT: the whole business at once — what is open, what is late, what is sitting on " +
      "nobody's desk, what is owed to suppliers, what duty is still to pay. " +
      "ORDERS: PO lines, worst-overdue first. " +
      "SHIPMENTS: bills of lading, where each has got to and what customs wants. " +
      "ENQUIRIES: RFQs and quotes, and what became of them. " +
      "DELIVERIES: what went out and what was billed. " +
      "BALANCES: what each PO still owes us — ordered less billed. " +
      "PAYMENTS: money out, one row per payment. " +
      "OWED: what we still owe each supplier, agent and forwarder, with how old it is. " +
      "TENDERS: bids being chased, and any deadline that passed with nothing submitted. " +
      "CONVERSION: enquiry-to-order by month, measured against the month the CLIENT ASKED, " +
      "so no rate can pass 100%. " +
      "Amounts are in shillings at the rate frozen on each line. Where something could not be " +
      "priced it says so — quote that rather than a total that quietly leaves lines out. " +
      "This tool cannot change anything.",
    schema: z.object({
      type: z.enum(OPS_TYPES).describe("Which part of the trading module to read"),
      company: z.string().optional().describe("Which company — defaults to PES, the trading business"),
      search: z.string().optional().describe("Filter by PO, item, client, supplier or reference"),
      openOnly: z.boolean().optional().describe("Only what is still outstanding — default true"),
      limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 30)"),
    }),
    capability: "navTasks",
    run: async (args, caller) => await mcpOps(caller, args as Parameters<typeof mcpOps>[1]),
  },
  {
    name: "list_records",
    title: "Look at the other registers",
    description:
      "Read the parts of COS beyond tasks. Pick a type:\n" +
      "• todos — the to-do list\n" +
      "• risks / decisions — the board-level risk register and decision log\n" +
      "• governance — one company's shareholding, directors, signatories, resolutions (needs a company)\n" +
      "• pipeline — applications in progress: permits, visas, licences and where each has got to\n" +
      "• commitments — leases, insurance and contracts, with when notice is due\n" +
      "• vendors — suppliers and contractors\n" +
      "• stock — the office consumables register (Supplies)\n" +
      "• cleaning — the daily cleaning log (Cleaning)\n" +
      "• announcements — what's been posted to staff\n" +
      "• holidays — the public holiday calendar\n" +
      "• facts — the fact ledger for one company (needs a company)\n" +
      "Use this before answering anything about these areas rather than guessing.",
    schema: z.object({
      type: z.enum(RECORD_TYPES).describe("Which register to read"),
      company: z.string().optional().describe("Limit to one company (required for governance and facts)"),
      search: z.string().optional().describe("Filter by title/name/description"),
      openOnly: z.boolean().optional().describe("Only outstanding items — default true"),
      limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 30)"),
    }),
    capability: "navTasks",
    run: async (args, caller) => await mcpListRecords(caller, args as Parameters<typeof mcpListRecords>[1]),
  },

  {
    name: "manage_todo",
    title: "To-do list",
    description:
      "Add a to-do, tick one off, or put one back. Use list_records with type 'todos' to find its id. " +
      "This is the personal to-do list — for work someone is accountable for, raise a task instead.",
    schema: z.object({
      action: z.enum(["create", "complete", "reopen"]),
      title: z.string().optional().describe("For 'create' — what needs doing"),
      id: z.number().int().optional().describe("For 'complete'/'reopen' — the to-do's id"),
      company: z.string().optional().describe("Optionally tie a new to-do to a company"),
      remindAt: z.string().optional().describe("Remind at this time, ISO format"),
    }),
    capability: "navTasks",
    write: true,
    run: async (args, caller) => await mcpManageTodo(caller, args as Parameters<typeof mcpManageTodo>[1]),
  },

  {
    name: "mark_attendance",
    title: "Mark attendance",
    description:
      "Record whether someone was in, out, on leave or absent on a given day. Defaults to today. " +
      "Marking replaces whatever was there, so check before overwriting a day somebody already filled in.",
    schema: z.object({
      person: z.string().describe("Who — must be an existing active person"),
      status: z.enum(ATTENDANCE_STATUSES),
      date: z.string().optional().describe("yyyy-mm-dd, default today"),
    }),
    capability: "navTasks",
    write: true,
    run: async (args, caller) => await mcpMarkAttendance(caller, args as Parameters<typeof mcpMarkAttendance>[1]),
  },

  {
    name: "manage_pipeline",
    title: "Applications in progress",
    description:
      "Track a permit, visa or licence through the stages: To Apply → Applied → Control No. Issued → " +
      "Paid → Receipt Received → Issued. Create a new case, move one to the next stage, or update its " +
      "control number, deadline, next action or notes.",
    schema: z.object({
      action: z.enum(["create", "advance", "update"]),
      id: z.number().int().optional().describe("For 'advance'/'update' — from list_records type 'pipeline'"),
      subject: z.string().optional().describe("For 'create' — who or what it's for"),
      type: z.string().optional().describe("For 'create' — e.g. 'Work permit', 'Business licence'"),
      company: z.string().optional(),
      stage: z.enum(PIPELINE_STAGE_NAMES).optional().describe("For 'advance' — the stage to move to"),
      controlNo: z.string().optional(),
      deadline: z.string().optional().describe("yyyy-mm-dd"),
      nextAction: z.string().optional(),
      notes: z.string().optional(),
    }),
    capability: "navTasks",
    write: true,
    run: async (args, caller) => await mcpManagePipeline(caller, args as Parameters<typeof mcpManagePipeline>[1]),
  },

  {
    name: "draft_announcement",
    title: "Draft an announcement (never publishes)",
    description:
      "Write an announcement to staff and save it as a DRAFT. It is NOT published and nobody is told — " +
      "a person publishes it from the Announcements page. Say so when you use it. It goes to everyone; " +
      "narrower audiences are chosen by hand in the UI.",
    schema: z.object({
      title: z.string().min(3),
      body: z.string().min(3).describe("The announcement itself, ready to publish as written"),
      type: z.enum(["policy", "holiday", "safety", "celebration", "operational", "urgent"]).optional(),
    }),
    // Owner-only: this reaches every member of staff once published.
    write: true,
    run: async (args, caller) => await mcpDraftAnnouncement(caller, args as Parameters<typeof mcpDraftAnnouncement>[1]),
  },

  {
    name: "undo_last_change",
    title: "Undo my last change",
    description:
      "Reverse something YOU changed in the last ten minutes — the most recent one, or a specific " +
      "undoToken returned by an earlier tool. It only reaches your own changes; it cannot undo " +
      "anything a person did. Past ten minutes, it has to be changed by hand in COS.",
    schema: z.object({
      token: z.string().optional().describe("An undoToken from an earlier result; omit for the most recent change"),
    }),
    // Anyone who can write can pull their own write back.
    capability: "createTasks",
    write: true,
    run: async (args, caller) => await mcpUndoLast(caller, args as Parameters<typeof mcpUndoLast>[1]),
  },
];

/** The tools this caller may see. Order is stable so prompt caching holds. */
export function toolsFor(caller: McpCaller): McpTool[] {
  return MCP_TOOLS.filter((t) => callerMayUse(t, caller));
}

/**
 * The companies this caller may see, named, for the server's instructions.
 *
 * Read LIVE rather than hard-coded: the portfolio has been renamed and extended
 * more than once (Dar Spices → DSC Ltd, Cocozuri Chocolat → Furaha Innovation
 * Ltd, plus later additions), and a stale list in a prompt sends the assistant
 * hunting for companies that no longer exist under that name.
 */
export async function companyNamesFor(caller: McpCaller): Promise<string[]> {
  try {
    const scope = await scopeFor(caller);
    let q = sb.from("companies").select("name").eq("active", true).order("id");
    if (scope != null) {
      if (scope.length === 0) return [];
      q = q.in("id", scope);
    }
    const { data } = await q;
    return (data ?? []).map((c) => c.name as string).filter(Boolean);
  } catch {
    return [];
  }
}
