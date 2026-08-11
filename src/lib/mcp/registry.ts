// The tool registry — the single source of truth for what an assistant can do
// through /api/mcp.
//
// FORWARD RULE: to add a tool, add ONE entry here. Name, description, input
// schema, the capability it needs and the handler live together; the endpoint
// derives everything else. Same idea as the entity registry (lib/entity-registry.ts)
// — one definition, no wiring in three places.
//
// STAGE 1 IS READ-ONLY. Every handler below reads. Nothing creates, edits,
// archives or deletes. Writes arrive in stage 2 (memory/mcp_stage2_safe_writes.md)
// and bring their own tier rules with them.
//
// Server-only.

import { z } from "zod";
import { sb } from "@/db/supabase";
import type { CapabilityKey } from "@/lib/portal-permissions";
import { companyScope } from "@/lib/portal-auth";
import type { McpCaller } from "@/lib/mcp/auth";
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
