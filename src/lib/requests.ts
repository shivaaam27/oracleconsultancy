import "server-only";
import { eq } from "drizzle-orm";
import { sb } from "@/db/supabase";
import { withTx } from "./tx";
import { indexEmbedding } from "./embeddings";
import { requests, requestUpdates, tasks, taskAssignees } from "@/db/schema";
import { createNotification, notifyMany, personRecipient } from "./notifications";
import type { RequestRow, RequestDetail, RequestRecipient, RequestParty, RequestTrends } from "./requests-shared";
import { REQUEST_CATEGORIES } from "./requests-shared";

export type { RequestRow, RequestDetail, RequestRecipient } from "./requests-shared";

const CATEGORIES_KEY = "v2.requestCategories";

/** The owner-managed list of request types (falls back to the default). */
export async function getRequestCategories(): Promise<string[]> {
  const { data } = await sb.from("settings").select("value").eq("key", CATEGORIES_KEY).maybeSingle();
  const raw = (data?.value as string | null) ?? null;
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr.map((s) => String(s));
    } catch {
      /* fall through to default */
    }
  }
  return REQUEST_CATEGORIES;
}

/** Persist the owner-managed request types (admin-gated in the action). */
export async function saveRequestCategories(list: string[]): Promise<void> {
  const clean = Array.from(new Set(list.map((s) => s.trim()).filter(Boolean))).slice(0, 30);
  await sb
    .from("settings")
    .upsert({ key: CATEGORIES_KEY, value: JSON.stringify(clean.length ? clean : REQUEST_CATEGORIES) }, { onConflict: "key" });
}

/* ------------------------------------------------------------------ *
 * Request Desk — server data layer + mutations. A request can be
 * addressed to one OR several people (and/or the owner); ANY recipient
 * can act on it ("shared / any-of"). Authorisation (who may raise/decide
 * what) lives in the server-action wrappers on each surface. See
 * memory/request_desk.md.
 * ------------------------------------------------------------------ */

const OPEN_STATUSES = ["open", "needs_info", "in_progress"];

/** The people a given staff member is allowed to address a request to. */
export async function requestRecipientsFor(meId: number): Promise<{ people: RequestRecipient[] }> {
  const { data: me } = await sb
    .from("people")
    .select("id,manager_id,department_id,company_id")
    .eq("id", meId)
    .maybeSingle();
  if (!me) return { people: [] };

  const [{ data: dotted }, { data: directors }, { data: hr }, deptHead] = await Promise.all([
    sb.from("reporting_lines").select("manager_id").eq("person_id", meId),
    sb.from("people").select("id").eq("portal_role", "director").eq("active", true),
    sb.from("people").select("id").eq("portal_role", "hr").eq("active", true),
    me.department_id != null && me.company_id != null
      ? sb
          .from("department_heads")
          .select("head_person_id")
          .eq("department_id", me.department_id)
          .eq("company_id", me.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { head_person_id: number } | null }),
  ]);

  const relById = new Map<number, string>();
  const order: number[] = [];
  const add = (id: number | null | undefined, relation: string) => {
    if (id == null || id === meId) return;
    if (!relById.has(id)) {
      relById.set(id, relation);
      order.push(id);
    }
  };
  add(me.manager_id as number | null, "Your manager");
  for (const r of dotted ?? []) add(r.manager_id as number | null, "Also reports to");
  add((deptHead.data?.head_person_id as number | null) ?? null, "Department head");
  for (const d of directors ?? []) add(d.id as number, "Director");
  for (const h of hr ?? []) add(h.id as number, "HR / Admin");

  if (order.length === 0) return { people: [] };
  const { data: rows } = await sb.from("people").select("id,name,active").in("id", order);
  const byId = new Map((rows ?? []).map((r) => [r.id as number, r]));
  const people = order
    .filter((id) => byId.get(id)?.active)
    .map((id) => ({ id, name: byId.get(id)!.name as string, relation: relById.get(id)! }));
  return { people };
}

export async function canAddress(meId: number, addresseeId: number): Promise<boolean> {
  const { people } = await requestRecipientsFor(meId);
  return people.some((p) => p.id === addresseeId);
}

/** Every active person, for the owner's composer (the owner may address anyone).
 *  `relation` carries the company name for context. */
export async function allActivePeople(): Promise<RequestRecipient[]> {
  const { data } = await sb
    .from("people")
    .select("id,name,role,companies(name)")
    .eq("active", true)
    .order("name", { ascending: true });
  return (data ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    relation: (p.companies as unknown as { name: string } | null)?.name ?? (p.role as string | null) ?? "Staff",
  }));
}

async function nextRequestCode(): Promise<string> {
  const { data } = await sb.from("requests").select("code").order("id", { ascending: false }).limit(1);
  let n = 1;
  const last = (data ?? [])[0]?.code as string | undefined;
  if (last) {
    const m = last.match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `REQ-${String(n).padStart(3, "0")}`;
}

function partyRecipientString(personId: number | null, isOwner: boolean): string | null {
  if (isOwner) return "admin";
  return personId != null ? personRecipient(personId) : null;
}

async function recipientStringsForRequest(requestId: number): Promise<string[]> {
  const { data } = await sb.from("request_recipients").select("person_id,is_owner").eq("request_id", requestId);
  return (data ?? [])
    .map((r) => partyRecipientString(r.person_id as number | null, r.is_owner as boolean))
    .filter((x): x is string => Boolean(x));
}

function requesterRecipientString(requesterId: number | null, fromOwner: boolean): string | null {
  if (fromOwner) return "admin";
  return requesterId != null ? personRecipient(requesterId) : null;
}

export type RaiseRecipient = { personId: number | null; isOwner: boolean };

export async function raiseRequest(input: {
  requesterId: number | null;
  fromOwner: boolean;
  recipients: RaiseRecipient[];
  companyId: number | null;
  category: string | null;
  title: string;
  body: string | null;
  createdBy: string;
  actorName: string;
  attachmentDocumentId?: number | null;
  attachmentName?: string | null;
}): Promise<{ id: number; code: string }> {
  // De-dupe recipients (and drop the requester from their own recipient list).
  const seen = new Set<string>();
  const recips = input.recipients.filter((r) => {
    if (!r.isOwner && r.personId != null && r.personId === input.requesterId) return false;
    const key = r.isOwner ? "owner" : `p:${r.personId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (recips.length === 0) throw new Error("Choose at least one person to send this to.");

  const now = new Date().toISOString();
  let row: { id: number; code: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextRequestCode();
    const { data, error } = await sb
      .from("requests")
      .insert({
        code,
        requester_id: input.requesterId,
        from_owner: input.fromOwner,
        company_id: input.companyId,
        category: input.category,
        title: input.title,
        body: input.body,
        status: "open",
        created_at: now,
        updated_at: now,
      })
      .select("id,code")
      .single();
    if (!error && data) {
      row = { id: data.id as number, code: data.code as string };
      break;
    }
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  if (!row) throw new Error("Could not create the request — please try again.");

  await sb.from("request_recipients").insert(
    recips.map((r) => ({ request_id: row!.id, person_id: r.isOwner ? null : r.personId, is_owner: r.isOwner }))
  );

  if (input.attachmentDocumentId) {
    await sb.from("request_updates").insert({
      request_id: row.id,
      body: `📎 ${input.attachmentName ?? "Attachment"}`,
      created_at: now,
      created_by: input.createdBy,
      attachment_document_id: input.attachmentDocumentId,
    });
  }

  // Notify every recipient, and always keep the owner in the loop.
  const recipients = new Set<string>();
  for (const r of recips) {
    const s = partyRecipientString(r.personId, r.isOwner);
    if (s) recipients.add(s);
  }
  recipients.add("admin");
  await notifyMany([...recipients], {
    kind: "request",
    requestId: row.id,
    title: `${input.actorName} raised a request`,
    body: input.title,
    actor: input.actorName,
  });
  return row;
}

export async function addRequestMessage(
  requestId: number,
  body: string,
  createdBy: string,
  actorRecipient: string,
  actorName: string,
  attachmentDocumentId?: number | null,
  attachmentName?: string | null
): Promise<void> {
  const { data: req } = await sb
    .from("requests")
    .select("id,code,requester_id,from_owner")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) throw new Error("Request not found.");
  const now = new Date().toISOString();
  await sb.from("request_updates").insert({
    request_id: requestId,
    body: body || `📎 ${attachmentName ?? "Attachment"}`,
    created_at: now,
    created_by: createdBy,
    attachment_document_id: attachmentDocumentId ?? null,
  });
  await sb.from("requests").update({ updated_at: now }).eq("id", requestId);

  const set = new Set<string>(await recipientStringsForRequest(requestId));
  const reqStr = requesterRecipientString(req.requester_id as number | null, req.from_owner as boolean);
  if (reqStr) set.add(reqStr);
  set.delete(actorRecipient);
  await notifyMany([...set], {
    kind: "request",
    requestId,
    title: `New reply on ${req.code}`,
    body: body || "Sent an attachment.",
    actor: actorName,
  });
}

async function notifyDecision(
  requestId: number,
  reqRow: { code: string; requester_id: number | null; from_owner: boolean },
  actorRecipient: string,
  title: string,
  body: string | null,
  actorName: string
) {
  const set = new Set<string>(await recipientStringsForRequest(requestId));
  const reqStr = requesterRecipientString(reqRow.requester_id, reqRow.from_owner);
  if (reqStr) set.add(reqStr);
  set.delete(actorRecipient);
  await notifyMany([...set], { kind: "request", requestId, title, body, actor: actorName });
}

export async function decideRequest(
  requestId: number,
  verdict: "approved" | "declined" | "noted",
  reason: string | null,
  decidedBy: string,
  actorName: string,
  actorRecipient: string
): Promise<void> {
  const { data: req } = await sb
    .from("requests")
    .select("id,code,requester_id,from_owner")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) throw new Error("Request not found.");
  const now = new Date().toISOString();
  await sb
    .from("requests")
    .update({ status: verdict, decision_reason: reason, decided_by: decidedBy, decided_at: now, updated_at: now })
    .eq("id", requestId);
  const label = verdict === "approved" ? "Approved" : verdict === "declined" ? "Declined" : "Noted";
  await sb.from("request_updates").insert({
    request_id: requestId,
    body: reason ? `${label} — ${reason}` : label,
    created_at: now,
    created_by: decidedBy,
    kind: "event",
  });
  await notifyDecision(
    requestId,
    { code: req.code as string, requester_id: req.requester_id as number | null, from_owner: req.from_owner as boolean },
    actorRecipient,
    `${req.code} was ${label.toLowerCase()}`,
    reason,
    actorName
  );
}

export async function advanceRequest(
  requestId: number,
  status: "in_progress" | "done" | "needs_info" | "open",
  by: string,
  actorName: string,
  actorRecipient: string
): Promise<void> {
  const { data: req } = await sb
    .from("requests")
    .select("id,code,requester_id,from_owner")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) throw new Error("Request not found.");
  const now = new Date().toISOString();
  await sb.from("requests").update({ status, updated_at: now }).eq("id", requestId);
  const label =
    status === "in_progress"
      ? "Marked in progress"
      : status === "done"
        ? "Marked done"
        : status === "needs_info"
          ? "Asked for more information"
          : "Reopened";
  await sb.from("request_updates").insert({ request_id: requestId, body: label, created_at: now, created_by: by, kind: "event" });
  if (status !== "open") {
    await notifyDecision(
      requestId,
      { code: req.code as string, requester_id: req.requester_id as number | null, from_owner: req.from_owner as boolean },
      actorRecipient,
      `${req.code}: ${label.toLowerCase()}`,
      null,
      actorName
    );
  }
}

export async function cancelRequest(requestId: number, by: string): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("requests").update({ status: "cancelled", updated_at: now }).eq("id", requestId);
  await sb
    .from("request_updates")
    .insert({ request_id: requestId, body: "Withdrawn by the requester", created_at: now, created_by: by, kind: "event" });
}

/** Phase 2 — turn an approved request into a real task, linked both ways. */
export async function convertRequestToTask(input: {
  requestId: number;
  companyId: number;
  accountableId: number;
  workingIds: number[];
  priority: string;
  deadline: Date | null;
  by: string;
  actorName: string;
  actorRecipient: string;
}): Promise<{ taskCode: string }> {
  const { data: req } = await sb
    .from("requests")
    .select("id,code,title,body,requester_id,from_owner,converted_task_id")
    .eq("id", input.requestId)
    .maybeSingle();
  if (!req) throw new Error("Request not found.");
  if (req.converted_task_id != null) throw new Error("This request has already been turned into a task.");

  const { data: company } = await sb
    .from("companies")
    .select("code,code_prefix")
    .eq("id", input.companyId)
    .maybeSingle();
  if (!company) throw new Error("Company not found.");
  const prefix = (company.code_prefix as string | null) || (company.code as string);

  const now = new Date();
  const deadline = input.deadline && !isNaN(input.deadline.getTime()) ? input.deadline : null;
  const assigneeRows = [
    { personId: input.accountableId, role: "accountable" },
    ...input.workingIds
      .filter((id) => id !== input.accountableId)
      .map((id) => ({ personId: id, role: "working" })),
  ];

  // The whole conversion — task + assignees + request flip + audit event — must
  // commit together or not at all, so a mid-sequence failure can never leave an
  // orphaned task or a half-converted request (ACTCOMMS-05). The task-code
  // allocation (read-max then insert) is a check-then-act, so we retry the WHOLE
  // transaction on a code collision, relying on the tasks.code UNIQUE backstop.
  let task: { id: number; code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !task; attempt++) {
    try {
      task = await withTx(async (tx) => {
        // Re-check inside the transaction so a concurrent convert can't double-spend.
        const current = await tx
          .select({ convertedTaskId: requests.convertedTaskId })
          .from(requests)
          .where(eq(requests.id, input.requestId));
        if ((current[0]?.convertedTaskId ?? null) != null) {
          throw new Error("This request has already been turned into a task.");
        }

        const existing = await tx
          .select({ code: tasks.code })
          .from(tasks)
          .where(eq(tasks.companyId, input.companyId));
        let maxNum = 0;
        for (const row of existing) {
          const m = row.code.match(/(\d+)$/);
          if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
        }
        const code = `${prefix}-${String(maxNum + 1 + attempt).padStart(3, "0")}`;

        const [inserted] = await tx
          .insert(tasks)
          .values({
            code,
            companyId: input.companyId,
            actionItem: req.title as string,
            ownerId: input.accountableId,
            status: "Not Started",
            priority: input.priority,
            deadline,
            createdDate: now,
            lastUpdatedAt: now,
            latestUpdate: (req.body as string | null) || null,
            archived: false,
          })
          .returning({ id: tasks.id, code: tasks.code });

        await tx
          .insert(taskAssignees)
          .values(assigneeRows.map((r) => ({ taskId: inserted.id, personId: r.personId, role: r.role })))
          .onConflictDoNothing();

        await tx
          .update(requests)
          .set({ convertedTaskId: inserted.id, status: "in_progress", updatedAt: now })
          .where(eq(requests.id, input.requestId));

        await tx.insert(requestUpdates).values({
          requestId: input.requestId,
          body: `Converted to task ${inserted.code}`,
          createdAt: now,
          createdBy: input.by,
          kind: "event",
        });

        return { id: inserted.id, code: inserted.code };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/duplicate key|unique/i.test(msg)) continue; // code collision — retry
      throw e;
    }
  }
  if (!task) throw new Error("Could not allocate a unique task code — please try again.");

  // Best-effort side-effects after the atomic commit (mirrors insertTaskWithUniqueCodeSb).
  void indexEmbedding("task", task.id, req.title as string);
  await notifyDecision(
    input.requestId,
    { code: req.code as string, requester_id: req.requester_id as number | null, from_owner: req.from_owner as boolean },
    input.actorRecipient,
    `${req.code} became task ${task.code}`,
    null,
    input.actorName
  );
  return { taskCode: task.code as string };
}

export async function markRequestSeen(requestId: number): Promise<void> {
  await sb.from("requests").update({ seen_at: new Date().toISOString() }).eq("id", requestId).is("seen_at", null);
}

/** Is this person a recipient of the request? (Used by action authorisation.) */
export async function isRecipient(requestId: number, personId: number): Promise<boolean> {
  const { data } = await sb
    .from("request_recipients")
    .select("id")
    .eq("request_id", requestId)
    .eq("person_id", personId)
    .limit(1);
  return (data ?? []).length > 0;
}

async function enrichRows(reqs: Record<string, unknown>[]): Promise<RequestRow[]> {
  if (reqs.length === 0) return [];
  const ids = reqs.map((r) => r.id as number);
  const personIds = new Set<number>();
  const companyIds = new Set<number>();
  for (const r of reqs) {
    if (r.requester_id != null) personIds.add(r.requester_id as number);
    if (r.company_id != null) companyIds.add(r.company_id as number);
  }
  const { data: recRows } = await sb
    .from("request_recipients")
    .select("request_id,person_id,is_owner")
    .in("request_id", ids);
  for (const rr of recRows ?? []) if (rr.person_id != null) personIds.add(rr.person_id as number);

  const [{ data: people }, { data: companies }] = await Promise.all([
    personIds.size ? sb.from("people").select("id,name").in("id", [...personIds]) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    companyIds.size ? sb.from("companies").select("id,name").in("id", [...companyIds]) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
  ]);
  const nameById = new Map((people ?? []).map((p) => [p.id as number, p.name as string]));
  const companyById = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));

  const recipientsByReq = new Map<number, RequestParty[]>();
  for (const rr of recRows ?? []) {
    const rid = rr.request_id as number;
    const list = recipientsByReq.get(rid) ?? [];
    if (rr.is_owner) list.push({ id: null, name: "Oracle Consultancy", isOwner: true });
    else list.push({ id: rr.person_id as number, name: nameById.get(rr.person_id as number) ?? "Unknown", isOwner: false });
    recipientsByReq.set(rid, list);
  }

  return reqs.map((r) => ({
    id: r.id as number,
    code: r.code as string,
    requesterId: (r.requester_id as number | null) ?? null,
    requesterName: r.from_owner ? "Oracle Consultancy" : nameById.get(r.requester_id as number) ?? "Unknown",
    requesterIsOwner: Boolean(r.from_owner),
    recipients: recipientsByReq.get(r.id as number) ?? [],
    companyName: r.company_id != null ? companyById.get(r.company_id as number) ?? null : null,
    category: (r.category as string | null) ?? null,
    title: r.title as string,
    status: r.status as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    seen: r.seen_at != null,
  }));
}

export async function listRequestsForAdmin(): Promise<RequestRow[]> {
  const { data } = await sb.from("requests").select("*").order("updated_at", { ascending: false });
  return enrichRows(data ?? []);
}

export async function listRequestsForPortal(meId: number): Promise<RequestRow[]> {
  const { data: rec } = await sb.from("request_recipients").select("request_id").eq("person_id", meId);
  const recIds = Array.from(new Set((rec ?? []).map((r) => r.request_id as number)));
  const filter = recIds.length ? `requester_id.eq.${meId},id.in.(${recIds.join(",")})` : `requester_id.eq.${meId}`;
  const { data } = await sb.from("requests").select("*").or(filter).order("updated_at", { ascending: false });
  return enrichRows(data ?? []);
}

export async function getRequestDetail(id: number): Promise<RequestDetail | null> {
  const { data: r } = await sb.from("requests").select("*").eq("id", id).maybeSingle();
  if (!r) return null;

  const { data: recRows } = await sb
    .from("request_recipients")
    .select("person_id,is_owner")
    .eq("request_id", id);
  const personIds = new Set<number>();
  if (r.requester_id != null) personIds.add(r.requester_id as number);
  for (const rr of recRows ?? []) if (rr.person_id != null) personIds.add(rr.person_id as number);

  const [{ data: people }, company, { data: updates }, convTask] = await Promise.all([
    personIds.size
      ? sb.from("people").select("id,name").in("id", [...personIds])
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    r.company_id != null
      ? sb.from("companies").select("name").eq("id", r.company_id as number).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    sb
      .from("request_updates")
      .select("id,body,created_at,created_by,kind,attachment_document_id")
      .eq("request_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    r.converted_task_id != null
      ? sb.from("tasks").select("code").eq("id", r.converted_task_id as number).maybeSingle()
      : Promise.resolve({ data: null as { code: string } | null }),
  ]);
  const nameById = new Map((people ?? []).map((p) => [p.id as number, p.name as string]));

  const docIds = Array.from(
    new Set((updates ?? []).map((u) => u.attachment_document_id as number | null).filter((x): x is number => x != null))
  );
  const { data: docs } = docIds.length
    ? await sb.from("documents").select("id,title").in("id", docIds)
    : { data: [] as { id: number; title: string }[] };
  const docTitleById = new Map((docs ?? []).map((d) => [d.id as number, d.title as string]));

  const recipients: RequestParty[] = (recRows ?? []).map((rr) =>
    rr.is_owner
      ? { id: null, name: "Oracle Consultancy", isOwner: true }
      : { id: rr.person_id as number, name: nameById.get(rr.person_id as number) ?? "Unknown", isOwner: false }
  );

  return {
    id: r.id as number,
    code: r.code as string,
    requesterId: (r.requester_id as number | null) ?? null,
    requesterName: r.from_owner ? "Oracle Consultancy" : nameById.get(r.requester_id as number) ?? "Unknown",
    requesterIsOwner: Boolean(r.from_owner),
    recipients,
    companyName: (company.data?.name as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    status: r.status as string,
    decisionReason: (r.decision_reason as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    seenAt: (r.seen_at as string | null) ?? null,
    convertedTaskId: (r.converted_task_id as number | null) ?? null,
    convertedTaskCode: (convTask.data?.code as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    thread: (updates ?? []).map((u) => {
      const docId = (u.attachment_document_id as number | null) ?? null;
      return {
        id: u.id as number,
        body: u.body as string,
        createdAt: u.created_at as string,
        createdBy: (u.created_by as string | null) ?? null,
        kind: (u.kind as string | null) ?? null,
        attachmentDocumentId: docId,
        attachmentName: docId != null ? docTitleById.get(docId) ?? null : null,
      };
    }),
  };
}

/** Open requests with the owner as a recipient — the "awaiting you" count. */
export async function ownerPendingRequestCount(): Promise<number> {
  const { data: ownerRecs } = await sb.from("request_recipients").select("request_id").eq("is_owner", true);
  const ids = Array.from(new Set((ownerRecs ?? []).map((r) => r.request_id as number)));
  if (ids.length === 0) return 0;
  const { count } = await sb
    .from("requests")
    .select("id", { count: "exact", head: true })
    .in("id", ids)
    .in("status", OPEN_STATUSES);
  return count ?? 0;
}

/** Aggregate stats for the Trends tab. */
export async function requestTrends(): Promise<RequestTrends> {
  const { data } = await sb.from("requests").select("status,category,company_id,created_at,decided_at");
  const rows = data ?? [];
  const companyIds = Array.from(new Set(rows.map((r) => r.company_id as number | null).filter((x): x is number => x != null)));
  const { data: companies } = companyIds.length
    ? await sb.from("companies").select("id,name").in("id", companyIds)
    : { data: [] as { id: number; name: string }[] };
  const companyName = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));

  const tally = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };

  const approved = rows.filter((r) => r.status === "approved").length;
  const declined = rows.filter((r) => r.status === "declined").length;
  const done = rows.filter((r) => r.status === "done").length;
  const open = rows.filter((r) => ["open", "needs_info", "in_progress"].includes(r.status as string)).length;

  const decided = rows.filter((r) => r.decided_at != null);
  const avgResponseHours =
    decided.length > 0
      ? decided.reduce((acc, r) => {
          const ms = new Date(r.decided_at as string).getTime() - new Date(r.created_at as string).getTime();
          return acc + Math.max(0, ms) / 3_600_000;
        }, 0) / decided.length
      : null;

  return {
    total: rows.length,
    open,
    approved,
    declined,
    done,
    approvalRate: approved + declined > 0 ? approved / (approved + declined) : null,
    avgResponseHours,
    byCategory: tally((r) => (r.category as string | null) || "Uncategorised"),
    byCompany: tally((r) => (r.company_id != null ? companyName.get(r.company_id as number) ?? "—" : "—")),
    byStatus: tally((r) => (r.status as string) || "open"),
  };
}
