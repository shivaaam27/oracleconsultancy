import "server-only";
import { sb } from "@/db/supabase";
import { createNotification, notifyMany, personRecipient } from "./notifications";
import type { RequestRow, RequestDetail, RequestRecipient } from "./requests-shared";

export type { RequestRow, RequestDetail, RequestRecipient } from "./requests-shared";

/* ------------------------------------------------------------------ *
 * Request Desk — server data layer + mutations. Authorisation (who may
 * raise/decide what) lives in the server-action wrappers on each surface
 * (portal vs admin); this module just does the data work and fires the
 * right notifications. See memory/request_desk.md.
 * ------------------------------------------------------------------ */

/** The people a given staff member is allowed to address a request to:
 *  their manager, any "also reports to" managers, their department head,
 *  every HR/Admin person and every director. (The owner is offered
 *  separately by the form.) Active people only; self excluded; deduped. */
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

/** Is this person an allowed addressee for that requester? Used by the
 *  action wrapper to validate the form before raising. */
export async function canAddress(meId: number, addresseeId: number): Promise<boolean> {
  const { people } = await requestRecipientsFor(meId);
  return people.some((p) => p.id === addresseeId);
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

function ownerOrPerson(toOwner: boolean, addresseeId: number | null): string | null {
  if (toOwner) return "admin";
  return addresseeId != null ? personRecipient(addresseeId) : null;
}

export async function raiseRequest(input: {
  requesterId: number;
  addresseeId: number | null;
  toOwner: boolean;
  companyId: number | null;
  category: string | null;
  title: string;
  body: string | null;
  createdBy: string;
  actorName: string;
  // Optional photo/file on the opening message (already uploaded to Documents).
  attachmentDocumentId?: number | null;
  attachmentName?: string | null;
}): Promise<{ id: number; code: string }> {
  const now = new Date().toISOString();
  let row: { id: number; code: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextRequestCode();
    const { data, error } = await sb
      .from("requests")
      .insert({
        code,
        requester_id: input.requesterId,
        addressee_id: input.toOwner ? null : input.addresseeId,
        to_owner: input.toOwner,
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

  // A photo/file on the opening message becomes the first thread entry.
  if (input.attachmentDocumentId) {
    await sb.from("request_updates").insert({
      request_id: row.id,
      body: `📎 ${input.attachmentName ?? "Attachment"}`,
      created_at: now,
      created_by: input.createdBy,
      attachment_document_id: input.attachmentDocumentId,
    });
  }

  // Tell the person it's addressed to, and always keep the owner in the loop.
  const recipients = new Set<string>();
  const to = ownerOrPerson(input.toOwner, input.addresseeId);
  if (to) recipients.add(to);
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
  actorName: string
): Promise<void> {
  const { data: req } = await sb
    .from("requests")
    .select("id,code,requester_id,addressee_id,to_owner")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) throw new Error("Request not found.");
  const now = new Date().toISOString();
  await sb.from("request_updates").insert({ request_id: requestId, body, created_at: now, created_by: createdBy });
  await sb.from("requests").update({ updated_at: now }).eq("id", requestId);

  const participants = [
    personRecipient(req.requester_id as number),
    ownerOrPerson(req.to_owner as boolean, (req.addressee_id as number | null) ?? null),
  ].filter((r): r is string => Boolean(r) && r !== actorRecipient);
  await notifyMany(participants, {
    kind: "request",
    requestId,
    title: `New reply on ${req.code}`,
    body,
    actor: actorName,
  });
}

export async function decideRequest(
  requestId: number,
  verdict: "approved" | "declined" | "noted",
  reason: string | null,
  decidedBy: string,
  actorName: string
): Promise<void> {
  const { data: req } = await sb.from("requests").select("id,code,requester_id").eq("id", requestId).maybeSingle();
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
  await createNotification({
    recipient: personRecipient(req.requester_id as number),
    kind: "request",
    requestId,
    title: `Your request ${req.code} was ${label.toLowerCase()}`,
    body: reason,
    actor: actorName,
  });
}

export async function advanceRequest(
  requestId: number,
  status: "in_progress" | "done" | "needs_info" | "open",
  by: string,
  actorName: string
): Promise<void> {
  const { data: req } = await sb.from("requests").select("id,code,requester_id").eq("id", requestId).maybeSingle();
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
    await createNotification({
      recipient: personRecipient(req.requester_id as number),
      kind: "request",
      requestId,
      title: `${req.code}: ${label.toLowerCase()}`,
      actor: actorName,
    });
  }
}

export async function cancelRequest(requestId: number, by: string): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("requests").update({ status: "cancelled", updated_at: now }).eq("id", requestId);
  await sb
    .from("request_updates")
    .insert({ request_id: requestId, body: "Withdrawn by the requester", created_at: now, created_by: by, kind: "event" });
}

/** Stamp that the addressee/owner has opened the request (once). */
export async function markRequestSeen(requestId: number): Promise<void> {
  await sb.from("requests").update({ seen_at: new Date().toISOString() }).eq("id", requestId).is("seen_at", null);
}

async function enrichRows(
  reqs: Record<string, unknown>[]
): Promise<RequestRow[]> {
  const personIds = new Set<number>();
  const companyIds = new Set<number>();
  for (const r of reqs) {
    personIds.add(r.requester_id as number);
    if (r.addressee_id != null) personIds.add(r.addressee_id as number);
    if (r.company_id != null) companyIds.add(r.company_id as number);
  }
  const [{ data: people }, { data: companies }] = await Promise.all([
    personIds.size ? sb.from("people").select("id,name").in("id", [...personIds]) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    companyIds.size ? sb.from("companies").select("id,name").in("id", [...companyIds]) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
  ]);
  const nameById = new Map((people ?? []).map((p) => [p.id as number, p.name as string]));
  const companyById = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));
  return reqs.map((r) => ({
    id: r.id as number,
    code: r.code as string,
    requesterId: r.requester_id as number,
    addresseeId: (r.addressee_id as number | null) ?? null,
    requesterName: nameById.get(r.requester_id as number) ?? "Unknown",
    addresseeName: r.addressee_id != null ? nameById.get(r.addressee_id as number) ?? null : null,
    toOwner: Boolean(r.to_owner),
    companyName: r.company_id != null ? companyById.get(r.company_id as number) ?? null : null,
    category: (r.category as string | null) ?? null,
    title: r.title as string,
    status: r.status as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    seen: r.seen_at != null,
  }));
}

/** Every request, newest activity first — the owner's control-centre inbox. */
export async function listRequestsForAdmin(): Promise<RequestRow[]> {
  const { data } = await sb.from("requests").select("*").order("updated_at", { ascending: false });
  return enrichRows(data ?? []);
}

/** Requests a portal person raised OR that are addressed to them. */
export async function listRequestsForPortal(meId: number): Promise<RequestRow[]> {
  const { data } = await sb
    .from("requests")
    .select("*")
    .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`)
    .order("updated_at", { ascending: false });
  return enrichRows(data ?? []);
}

export async function getRequestDetail(id: number): Promise<RequestDetail | null> {
  const { data: r } = await sb.from("requests").select("*").eq("id", id).maybeSingle();
  if (!r) return null;
  const personIds = [r.requester_id as number, r.addressee_id as number | null].filter(
    (x): x is number => x != null
  );
  const [{ data: people }, company, { data: updates }] = await Promise.all([
    personIds.length
      ? sb.from("people").select("id,name").in("id", personIds)
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
  ]);
  const nameById = new Map((people ?? []).map((p) => [p.id as number, p.name as string]));
  // Resolve attached document names (file titles) for any messages that carry one.
  const docIds = Array.from(
    new Set((updates ?? []).map((u) => u.attachment_document_id as number | null).filter((x): x is number => x != null))
  );
  const { data: docs } = docIds.length
    ? await sb.from("documents").select("id,title").in("id", docIds)
    : { data: [] as { id: number; title: string }[] };
  const docTitleById = new Map((docs ?? []).map((d) => [d.id as number, d.title as string]));
  return {
    id: r.id as number,
    code: r.code as string,
    requesterId: r.requester_id as number,
    requesterName: nameById.get(r.requester_id as number) ?? "Unknown",
    addresseeId: (r.addressee_id as number | null) ?? null,
    addresseeName: r.addressee_id != null ? nameById.get(r.addressee_id as number) ?? null : null,
    toOwner: Boolean(r.to_owner),
    companyName: (company.data?.name as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    status: r.status as string,
    decisionReason: (r.decision_reason as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    seenAt: (r.seen_at as string | null) ?? null,
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

/** Open requests addressed to the owner — the "awaiting you" count. */
export async function ownerPendingRequestCount(): Promise<number> {
  const { count } = await sb
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("to_owner", true)
    .in("status", ["open", "needs_info", "in_progress"]);
  return count ?? 0;
}
