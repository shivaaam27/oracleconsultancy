// The rest of COS, reachable from /api/mcp — the modules beyond tasks.
//
// WHY ONE READING TOOL AND NOT TWELVE. Every tool's description sits in the
// prompt of EVERY conversation. Nineteen tools is comfortable; a hundred and
// fifty would make the assistant slower, dearer and measurably worse at choosing
// between them. So the twelve remaining modules are read through ONE tool with a
// `type` argument, not one tool each. `list_records` costs a single description
// and covers to-dos, risks, decisions, governance, applications in progress,
// commitments, vendors, stock, cleaning, announcements, holidays and facts.
//
// Writes are the opposite: they get their own typed tools, because a generic
// "write anything" tool is exactly how an assistant mangles a record. Only four
// modules are writable here, chosen because they are things the owner actually
// asks for day to day. Everything else is read-only through this door — see the
// note at the bottom for what was deliberately left out and why.
//
// Same rules as lib/mcp/writes.ts: never deletes, never sends, scope applied to
// the data, and nothing is created from a name that doesn't already exist.
//
// Server-only.

import { sb } from "@/db/supabase";
import { companyScope } from "@/lib/portal-auth";
import { callerStamp, type McpCaller } from "@/lib/mcp/auth";
import { mutate, type Actor } from "@/lib/mutate";
import type { WriteResult } from "@/lib/mcp/writes";

/* --------------------------------------------------------------- *
 * What can be read
 * --------------------------------------------------------------- */

export const RECORD_TYPES = [
  "todos", "risks", "decisions", "governance", "pipeline", "commitments",
  "vendors", "stock", "cleaning", "announcements", "holidays", "facts",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/**
 * Types only the owner may read.
 *
 * Governance and the fact ledger hold shareholdings, directors' details, bank
 * and passport facts. The portal has no capability that grants these, so nothing
 * short of the owner gets them — a director reading the board pack is a decision
 * to make deliberately, not a side effect of merging modules into one tool.
 */
const OWNER_ONLY: RecordType[] = ["governance", "facts"];

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function isoDay(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function scopeFor(caller: McpCaller): Promise<number[] | null> {
  if (caller.kind === "owner") return null;
  return await companyScope(caller.person);
}

/** Keep only rows this caller's companies cover. A row with NO company is
 *  portfolio-level, so a scoped caller has no claim to it. */
function scoped<T extends { companyId?: number | null }>(rows: T[], scope: number[] | null): T[] {
  if (scope == null) return rows;
  const allowed = new Set(scope);
  return rows.filter((r) => r.companyId != null && allowed.has(r.companyId));
}

/** Case-insensitive "does any of this text contain the needle". */
function matches(needle: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  return fields.filter(Boolean).join(" ").toLowerCase().includes(n);
}

/* --------------------------------------------------------------- *
 * list_records
 * --------------------------------------------------------------- */

export async function mcpListRecords(
  caller: McpCaller,
  args: { type: RecordType; company?: string; search?: string; openOnly?: boolean; limit?: number },
): Promise<WriteResult> {
  const type = args.type;
  if (!RECORD_TYPES.includes(type)) {
    return { ok: false, error: `I can look at: ${RECORD_TYPES.join(", ")}.` };
  }
  if (OWNER_ONLY.includes(type) && caller.kind !== "owner") {
    return { ok: false, error: `${type} isn't something your login can read.` };
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, args.limit ?? DEFAULT_LIMIT));
  const scope = await scopeFor(caller);
  const search = args.search?.trim() || undefined;
  const openOnly = args.openOnly !== false;

  // A company filter is a NAME the caller typed; resolve it inside their scope so
  // it can never be used to reach past it.
  let companyId: number | null = null;
  if (args.company) {
    const { resolveCompany } = await import("@/lib/mcp/writes");
    const c = await resolveCompany(caller, args.company);
    if ("error" in c) return { ok: false, error: c.error };
    companyId = c.id;
  }
  const byCompany = <T extends { companyId?: number | null }>(rows: T[]) =>
    companyId == null ? rows : rows.filter((r) => r.companyId === companyId);

  const out = (rows: unknown[]) => ({ ok: true as const, type, count: rows.length, records: rows.slice(0, limit) });

  switch (type) {
    case "todos": {
      const { listTodos } = await import("@/app/todos/actions");
      let rows = await listTodos();
      rows = scoped(byCompany(rows), scope);
      if (openOnly) rows = rows.filter((t) => !t.done);
      if (search) rows = rows.filter((t) => matches(search, t.title, t.companyName, t.personName));
      return out(rows.map((t) => ({
        id: t.id, title: t.title, done: t.done, important: t.important,
        due: isoDay(t.dueAt), company: t.companyName, person: t.personName, task: t.taskCode,
      })));
    }

    case "risks": {
      const { getRiskRegister } = await import("@/lib/governance");
      let rows = await getRiskRegister();
      if (openOnly) rows = rows.filter((r) => (r.status ?? "").toLowerCase() !== "closed");
      if (search) rows = rows.filter((r) => matches(search, r.title, r.category, r.owner));
      rows.sort((a, b) => b.score - a.score); // worst first (DESIGN_SYSTEM §12)
      return out(rows.map((r) => ({
        code: r.code, title: r.title, band: r.band, score: r.score,
        category: r.category, owner: r.owner, status: r.status, mitigation: r.mitigation,
      })));
    }

    case "decisions": {
      const { getDecisions } = await import("@/lib/governance");
      let rows = await getDecisions();
      rows = scoped(byCompany(rows), scope);
      if (openOnly) rows = rows.filter((d) => (d.status ?? "").toLowerCase() !== "decided");
      if (search) rows = rows.filter((d) => matches(search, d.title, d.context, d.companyName));
      return out(rows.map((d) => ({
        code: d.code, title: d.title, company: d.companyName, status: d.status,
        due: isoDay(d.due), decision: d.decision, decidedOn: isoDay(d.decidedOn),
      })));
    }

    case "governance": {
      if (companyId == null) return { ok: false, error: "Which company's governance? Governance is held per company." };
      const { getCompanyGovernance } = await import("@/lib/governance");
      const g = await getCompanyGovernance(companyId);
      return { ok: true, type, company: args.company, governance: g };
    }

    case "pipeline": {
      const { listPipeline } = await import("@/lib/pipeline");
      let rows = await listPipeline();
      rows = scoped(byCompany(rows), scope);
      if (openOnly) rows = rows.filter((p) => p.stage !== "Issued");
      if (search) rows = rows.filter((p) => matches(search, p.subject, p.type, p.companyName, p.owner));
      return out(rows.map((p) => ({
        id: p.id, subject: p.subject, type: p.type, stage: p.stage, company: p.companyName,
        controlNo: p.controlNo, deadline: isoDay(p.deadline), nextAction: p.nextAction, owner: p.owner,
      })));
    }

    case "commitments": {
      const { listCommitments } = await import("@/lib/commitments");
      let rows = await listCommitments();
      rows = scoped(byCompany(rows), scope);
      if (search) rows = rows.filter((c) => matches(search, c.title, c.counterparty, c.companyName));
      return out(rows.map((c) => ({
        id: c.id, title: c.title, kind: c.kind, company: c.companyName, counterparty: c.counterparty,
        ends: isoDay(c.endDate), noticeDays: c.noticeDays, status: c.status,
      })));
    }

    case "vendors": {
      const { listVendors } = await import("@/lib/vendors");
      let rows = await listVendors();
      rows = scoped(byCompany(rows), scope);
      if (openOnly) rows = rows.filter((v) => v.active);
      if (search) rows = rows.filter((v) => matches(search, v.name, v.category, v.contactName, v.companyName));
      return out(rows.map((v) => ({
        id: v.id, name: v.name, category: v.category, company: v.companyName,
        contact: v.contactName, email: v.email, phone: v.phone,
        contracts: v.docCount, expiredContracts: v.expiredCount,
      })));
    }

    case "stock": {
      // Supplies is one office's consumables, not per-company, so a scoped caller has
      // no claim to it.
      if (scope != null) return { ok: false, error: "The stock register isn't something your login can read." };
      const { listStockItems } = await import("@/lib/stock");
      let rows = await listStockItems();
      if (search) rows = rows.filter((s) => matches(search, s.name, s.code, s.category));
      return out(rows.map((s) => ({
        id: s.id, code: s.code, name: s.name, category: s.category,
        unit: s.unit, reorderLevel: s.reorderLevel,
      })));
    }

    case "cleaning": {
      if (scope != null) return { ok: false, error: "The cleaning register isn't something your login can read." };
      const { listDays } = await import("@/lib/cleaning");
      const rows = await listDays({ limit });
      return out(rows.map((d) => ({
        date: isoDay(d.date), note: d.note, signedBy: d.signedByName, signedAt: isoDay(d.signedAt),
      })));
    }

    case "announcements": {
      const { listAnnouncements } = await import("@/lib/announcements");
      let rows = await listAnnouncements();
      if (search) rows = rows.filter((a) => matches(search, a.title, a.body, a.type));
      return out(rows.map((a) => ({
        id: a.id, title: a.title, type: a.type, status: a.status,
        audience: a.audienceKind, published: isoDay((a as { publishedAt?: string | null }).publishedAt ?? null),
      })));
    }

    case "holidays": {
      const { listHolidays } = await import("@/lib/leave");
      let rows = await listHolidays();
      if (search) rows = rows.filter((h) => matches(search, h.name));
      return out(rows.map((h) => ({ date: isoDay(h.date), name: h.name })));
    }

    case "facts": {
      const { listFacts } = await import("@/lib/facts");
      if (companyId == null) return { ok: false, error: "Facts are held per company — which one?" };
      const rows = await listFacts({ type: "company", id: companyId });
      return out(rows as unknown[]);
    }
  }
}

/* --------------------------------------------------------------- *
 * Writes — four modules, each with its own typed tool
 * --------------------------------------------------------------- */

function actorFor(caller: McpCaller): Actor {
  return callerStamp(caller) as Actor;
}

/** Register an undo token around a write that an existing action performed. */
async function withUndo(caller: McpCaller, kind: string, payload: Record<string, unknown>): Promise<string | null> {
  const r = await mutate({
    kind,
    actor: actorFor(caller),
    run: async () => ({ result: payload, undo: { kind, payload } }),
  });
  return r.ok ? r.undoToken ?? null : null;
}

/* ---- to-dos ---- */

export async function mcpManageTodo(
  caller: McpCaller,
  args: { action: "create" | "complete" | "reopen"; title?: string; id?: number; company?: string; remindAt?: string },
): Promise<WriteResult> {
  const { createTodo, toggleTodo } = await import("@/app/todos/actions");

  if (args.action === "create") {
    const title = (args.title ?? "").trim();
    if (!title) return { ok: false, error: "What is the to-do?" };
    let companyId: number | null = null;
    if (args.company) {
      const { resolveCompany } = await import("@/lib/mcp/writes");
      const c = await resolveCompany(caller, args.company);
      if ("error" in c) return { ok: false, error: c.error };
      companyId = c.id;
    }
    const todo = await createTodo({ title, companyId, remindAt: args.remindAt ?? null });
    const undoToken = await withUndo(caller, "mcp.todo.create", { todoId: todo.id });
    return { ok: true, id: todo.id, title: todo.title, undoToken };
  }

  const id = Number(args.id);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Which to-do? Give me its id from list_records." };
  const { data: before } = await sb.from("todos").select("id,done").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: `No to-do with id ${id}.` };

  const done = args.action === "complete";
  await toggleTodo(id, done);
  const undoToken = await withUndo(caller, "mcp.todo.toggle", { todoId: id, before: before.done as boolean });
  return { ok: true, id, done, undoToken };
}

/* ---- attendance ---- */

export const ATTENDANCE_STATUSES = [
  "Present", "Absent", "On leave", "Holiday", "Remote", "Half-day", "Sick",
] as const;

export async function mcpMarkAttendance(
  caller: McpCaller,
  args: { person: string; status: (typeof ATTENDANCE_STATUSES)[number]; date?: string },
): Promise<WriteResult> {
  const { resolvePerson } = await import("@/lib/mcp/writes");
  const person = await resolvePerson(caller, args.person);
  if ("error" in person) return { ok: false, error: person.error };

  const status = ATTENDANCE_STATUSES.find((s) => s.toLowerCase() === String(args.status ?? "").toLowerCase());
  if (!status) return { ok: false, error: `Status must be one of: ${ATTENDANCE_STATUSES.join(", ")}.` };

  const date = (args.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: `"${args.date}" isn't a date I can read — use yyyy-mm-dd.` };

  // Snapshot so undo puts back what was there, including "nothing".
  const { data: before } = await sb
    .from("attendance").select("status").eq("person_id", person.id).eq("date", `${date}T00:00:00.000Z`).maybeSingle();

  const { recordAttendanceAction } = await import("@/app/hrms/leave/actions");
  const res = await recordAttendanceAction(person.id, date, status);
  if (!res.ok) return { ok: false, error: res.error };

  const undoToken = await withUndo(caller, "mcp.attendance.record", {
    personId: person.id, date, before: (before?.status as string | null) ?? null,
  });
  return { ok: true, person: person.name, date, status, undoToken };
}

/* ---- applications in progress (pipeline) ---- */

export const PIPELINE_STAGE_NAMES = [
  "To Apply", "Applied", "Control No. Issued", "Paid", "Receipt Received", "Issued",
] as const;

export async function mcpManagePipeline(
  caller: McpCaller,
  args: {
    action: "create" | "advance" | "update";
    id?: number;
    subject?: string;
    type?: string;
    company?: string;
    stage?: (typeof PIPELINE_STAGE_NAMES)[number];
    controlNo?: string;
    deadline?: string;
    nextAction?: string;
    notes?: string;
  },
): Promise<WriteResult> {
  const stageOf = (v: string | undefined) =>
    PIPELINE_STAGE_NAMES.find((s) => s.toLowerCase() === String(v ?? "").toLowerCase());

  if (args.action === "create") {
    const subject = (args.subject ?? "").trim();
    const kind = (args.type ?? "").trim();
    if (!subject || !kind) return { ok: false, error: "An application needs a subject (who/what it's for) and a type (permit, visa, licence…)." };
    let companyId: number | null = null;
    if (args.company) {
      const { resolveCompany } = await import("@/lib/mcp/writes");
      const c = await resolveCompany(caller, args.company);
      if ("error" in c) return { ok: false, error: c.error };
      companyId = c.id;
    } else if (caller.kind === "person") {
      return { ok: false, error: "Which company is this application for?" };
    }
    const { createPipelineItemAction } = await import("@/app/hrms/pipeline/actions");
    const res = await createPipelineItemAction({
      subject, type: kind, companyId,
      stage: stageOf(args.stage) ?? "To Apply",
      controlNo: args.controlNo ?? null,
      deadline: args.deadline ?? null,
      nextAction: args.nextAction ?? null,
      notes: args.notes ?? null,
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Could not create it." };
    const { data: fresh } = await sb.from("pipeline").select("id").order("id", { ascending: false }).limit(1);
    const id = (fresh?.[0]?.id as number | undefined) ?? null;
    const undoToken = id ? await withUndo(caller, "mcp.pipeline.create", { pipelineId: id }) : null;
    return { ok: true, id, subject, stage: stageOf(args.stage) ?? "To Apply", undoToken };
  }

  const id = Number(args.id);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Which application? Give me its id from list_records." };

  const { data: row } = await sb.from("pipeline").select("id,subject,stage,company_id").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: `No application with id ${id}.` };
  const scope = await scopeFor(caller);
  if (scope != null) {
    const cid = row.company_id as number | null;
    if (cid == null || !scope.includes(cid)) return { ok: false, error: "That application isn't one of yours." };
  }

  if (args.action === "advance") {
    const stage = stageOf(args.stage);
    if (!stage) return { ok: false, error: `Which stage? One of: ${PIPELINE_STAGE_NAMES.join(" → ")}.` };
    const { movePipelineStageAction } = await import("@/app/hrms/pipeline/actions");
    const res = await movePipelineStageAction(id, stage);
    if (!res.ok) return { ok: false, error: res.error ?? "Could not move it." };
    const undoToken = await withUndo(caller, "mcp.pipeline.stage", { pipelineId: id, before: row.stage as string });
    return { ok: true, id, subject: row.subject, stage, was: row.stage, undoToken };
  }

  const { updatePipelineItemAction } = await import("@/app/hrms/pipeline/actions");
  const patch: Record<string, unknown> = {};
  if (args.controlNo !== undefined) patch.controlNo = args.controlNo;
  if (args.deadline !== undefined) patch.deadline = args.deadline;
  if (args.nextAction !== undefined) patch.nextAction = args.nextAction;
  if (args.notes !== undefined) patch.notes = args.notes;
  if (Object.keys(patch).length === 0) return { ok: false, error: "What should I change? (control number, deadline, next action or notes)" };
  const res = await updatePipelineItemAction(id, patch);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not update it." };
  return { ok: true, id, subject: row.subject, changed: Object.keys(patch) };
}

/* ---- announcements — DRAFT ONLY ---- */

export async function mcpDraftAnnouncement(
  caller: McpCaller,
  args: { title: string; body: string; type?: string; audience?: string },
): Promise<WriteResult> {
  // Owner-only: publishing reaches every member of staff, so even drafting one is
  // not something a staff login should do through an assistant.
  if (caller.kind !== "owner") return { ok: false, error: "Announcements aren't something your login can write." };

  const title = (args.title ?? "").trim();
  const body = (args.body ?? "").trim();
  if (!title || !body) return { ok: false, error: "An announcement needs a title and something to say." };

  const types = ["policy", "holiday", "safety", "celebration", "operational", "urgent"];
  const type = types.find((t) => t === (args.type ?? "operational").toLowerCase()) ?? "operational";

  const fd = new FormData();
  fd.set("title", title);
  fd.set("body", body);
  fd.set("type", type);
  // "all" is the only audience offered here. The finer audiences (department,
  // site, role, named people) are a picker in the UI, and getting one wrong sends
  // the wrong people a notice — so that choice stays with a human.
  fd.set("audienceKind", "all");
  // NOT "publish". A draft sits in Announcements until a person publishes it,
  // which is the same rule as draft_message: an assistant never reaches staff.
  fd.set("action", "draft");

  const { saveAnnouncementAction } = await import("@/app/announcements/actions");
  const res = await saveAnnouncementAction(fd);
  if (!res.ok) return { ok: false, error: res.error };

  const undoToken = res.id ? await withUndo(caller, "mcp.announcement.draft", { announcementId: res.id }) : null;
  return {
    ok: true,
    id: res.id,
    title,
    note: "Saved as a DRAFT in Announcements — nobody has been told. Publish it yourself when you're happy with it.",
    undoToken,
  };
}

/* --------------------------------------------------------------- *
 * Deliberately NOT writable through this door
 * --------------------------------------------------------------- *
 *
 * • People — creating or editing a staff record has HR consequences and
 *   duplicates are painful to unpick. Reading is covered (list_people/get_person).
 * • Chat — sending a chat message IS sending a message to a person. Same rule as
 *   WhatsApp and email: an assistant does not do it.
 * • Publishing announcements, holidays, cleaning ticks, stock issues, governance
 *   and the fact ledger — either they reach people, or they are records a person
 *   should enter deliberately with the evidence in front of them.
 *
 * If any of these turns out to be wanted, it is a conversation with the owner and
 * a typed tool of its own — not a widening of something here.
 */
