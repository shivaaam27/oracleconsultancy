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
  PRIORITIES, CATEGORIES, OPEN_STATUSES, ALL_STATUSES, BULK_ACTIONS,
} from "@/lib/mcp/writes";
import { getAllTasks, computeCompanyKpis, computeGlobalKpis, type TaskRow } from "@/lib/queries";
import { getAllPeopleWithWorkload, getPersonDetail } from "@/lib/people-queries";
import { teamAttendanceToday } from "@/lib/attendance";
import { listCalendarEvents } from "@/lib/calendar";
import { listDocuments } from "@/lib/documents";
import { getBrief } from "@/lib/director-brief";
import { unifiedSearch } from "@/lib/search";

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
      company: z.string().optional().describe("Company name or part of it, e.g. 'Dar Spices'"),
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
      "Raise ONE new task. Give the company and a title; optionally who it's for, a deadline " +
      "(yyyy-mm-dd), a priority and an opening note. People must already exist — if a name " +
      "doesn't match anybody this fails rather than inventing a member of staff. " +
      "Tell the person what you created, including the task code you get back.",
    schema: z.object({
      company: z.string().describe("Company name or its two-letter prefix, e.g. 'DSC Ltd' or 'DS'"),
      title: z.string().min(3).describe("What actually needs doing, in a line"),
      assignees: z.array(z.string()).optional().describe("Names of existing people to make responsible"),
      deadline: z.string().optional().describe("Due date, yyyy-mm-dd"),
      priority: z.enum(PRIORITIES).optional().describe("Default Medium"),
      status: z.enum(OPEN_STATUSES).optional().describe("Starting status, default Not Started"),
      category: z.enum(CATEGORIES).optional(),
      note: z.string().optional().describe("An opening instruction or context for whoever picks it up"),
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
    name: "create_event",
    title: "Put something in the diary",
    description:
      "Create a meeting or event. It reaches the diary and Google, and — this is the ONE thing " +
      "here that emails anybody — an invitation is sent to attendees who have an email address. " +
      "So be sure of the people and the time before you call it, and say afterwards who was " +
      "invited. Pass sendInvitations: false to pencil something in without telling anyone. " +
      "Times are Dar es Salaam (EAT). Use 'yyyy-mm-dd HH:MM', or just 'yyyy-mm-dd' for all day.",
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
