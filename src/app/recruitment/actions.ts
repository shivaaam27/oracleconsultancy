"use server";

// Server actions for the recruitment desk (Phase 1).
//
// Thin wrappers, exactly as `app/projects/actions.ts` is: validate, call the
// library, revalidate the pages, hand back a plain result the form can show.
// No arithmetic and no database access here — the fee lives in
// lib/recruitment-money.ts and the writes in lib/recruitment.ts.

import { revalidatePath } from "next/cache";
import {
  createClient, updateClient, archiveClient, type ClientFields,
  createCandidate, updateCandidate, archiveCandidate, type CandidateFields,
  createJobOrder, updateJobOrder, archiveJobOrder, type JobOrderFields,
  agencyCompanyId,
  addToShortlist, updateShortlist, removeFromShortlist, type ShortlistFields,
  scheduleInterview, updateInterview,
  recordAcceptance, recordStart, recordEnd, clearEnd, recordCheckIn,
  deleteClient, deleteCandidate, deleteJobOrder, deleteInterview, deletePlacement, deleteCheckIn,
  updatePlacement,
} from "@/lib/recruitment";

type Result = { ok: boolean; id?: number; ref?: string; error?: string };

/** The desk and every list read derived figures off each other — an order that
 *  moves stage changes the client's "open roles" count — so refresh the lot. */
function refresh(path?: string) {
  revalidatePath("/recruitment");
  revalidatePath("/recruitment/orders");
  revalidatePath("/recruitment/candidates");
  revalidatePath("/recruitment/clients");
  if (path) revalidatePath(path);
}

/* ─────────────────────────────────────────────────────────────── clients ── */

export async function createClientAction(input: ClientFields): Promise<Result> {
  if (!input.name?.trim()) return { ok: false, error: "Give the client a name." };
  if (!input.companyId) return { ok: false, error: "No agency company was found. Check Companies." };
  const res = await createClient(input);
  if (!res.ok) return { ok: false, error: friendly(res.error, "client") };
  refresh();
  return { ok: true, id: res.id };
}

export async function updateClientAction(id: number, patch: Partial<ClientFields>): Promise<Result> {
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "The client needs a name." };
  const res = await updateClient(id, patch);
  if (!res.ok) return { ok: false, error: friendly(res.error, "client") };
  refresh(`/recruitment/clients/${id}`);
  return { ok: true, id };
}

export async function archiveClientAction(id: number, archived = true): Promise<Result> {
  const res = await archiveClient(id, archived);
  if (!res.ok) return { ok: false, error: "Couldn't archive the client. Please try again." };
  refresh(`/recruitment/clients/${id}`);
  return { ok: true, id };
}

/* ──────────────────────────────────────────────────────────── candidates ── */

export async function createCandidateAction(input: CandidateFields): Promise<Result> {
  if (!input.name?.trim()) return { ok: false, error: "Give the candidate a name." };
  if (!input.companyId) return { ok: false, error: "No agency company was found. Check Companies." };
  const res = await createCandidate(input);
  if (!res.ok) return { ok: false, error: friendly(res.error, "candidate") };
  refresh();
  return { ok: true, id: res.id };
}

export async function updateCandidateAction(id: number, patch: Partial<CandidateFields>): Promise<Result> {
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "The candidate needs a name." };
  const res = await updateCandidate(id, patch);
  if (!res.ok) return { ok: false, error: friendly(res.error, "candidate") };
  refresh(`/recruitment/candidates/${id}`);
  return { ok: true, id };
}

export async function archiveCandidateAction(id: number, archived = true): Promise<Result> {
  const res = await archiveCandidate(id, archived);
  if (!res.ok) return { ok: false, error: "Couldn't archive the candidate. Please try again." };
  refresh(`/recruitment/candidates/${id}`);
  return { ok: true, id };
}

/* ──────────────────────────────────────────────────────────── job orders ── */

export async function createJobOrderAction(input: JobOrderFields): Promise<Result> {
  if (!input.title?.trim()) return { ok: false, error: "Give the role a title." };
  if (!input.companyId) return { ok: false, error: "No agency company was found. Check Companies." };
  const res = await createJobOrder(input);
  if (!res.ok) return { ok: false, error: friendly(res.error, "job order") };
  refresh();
  return { ok: true, id: res.id, ref: res.ref };
}

export async function updateJobOrderAction(
  id: number, ref: string, patch: Partial<JobOrderFields>,
): Promise<Result> {
  if (patch.title !== undefined && !patch.title.trim()) return { ok: false, error: "The role needs a title." };
  const res = await updateJobOrder(id, patch);
  if (!res.ok) return { ok: false, error: friendly(res.error, "job order") };
  refresh(`/recruitment/orders/${ref}`);
  return { ok: true, id };
}

export async function archiveJobOrderAction(id: number, archived = true): Promise<Result> {
  const res = await archiveJobOrder(id, archived);
  if (!res.ok) return { ok: false, error: "Couldn't archive the job order. Please try again." };
  refresh();
  return { ok: true, id };
}

/**
 * A database error, said in English.
 *
 * ⚠️ The one that matters is the duplicate-name index: without this the owner
 * gets `duplicate key value violates unique constraint "rec_clients_name_unique"`,
 * which reads as a crash rather than as "you already have one of those".
 */
function friendly(message: string, what: string): string {
  if (/duplicate key|already exists|unique constraint/i.test(message)) {
    return `There is already a ${what} with that name.`;
  }
  return `Couldn't save the ${what}. Please try again.`;
}

/* ═══════════════════════════════════════════════════ PHASE 2 — end to end ══ */

/**
 * The company is resolved HERE, on the server, for every write.
 *
 * It is never passed in from the browser: an id that arrives from a form is an
 * id somebody could change, and every one of these rows is scoped by it.
 */
async function agencyOrFail(): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const id = await agencyCompanyId();
  return id ? { ok: true, id } : { ok: false, error: "No agency company was found. Check Companies." };
}

function refreshAssignment(ref?: string) {
  revalidatePath("/recruitment");
  revalidatePath("/recruitment/orders");
  revalidatePath("/recruitment/shortlists");
  revalidatePath("/recruitment/interviews");
  revalidatePath("/recruitment/placements");
  if (ref) revalidatePath(`/recruitment/orders/${ref}`);
}

/* ─────────────────────────────────────────────────────────── shortlist ───── */

export async function addToShortlistAction(
  jobOrderId: number, candidateId: number, matchNote: string, ref?: string,
): Promise<Result> {
  const co = await agencyOrFail();
  if (!co.ok) return { ok: false, error: co.error };
  const res = await addToShortlist(co.id, jobOrderId, candidateId, matchNote);
  if (!res.ok) {
    if (/duplicate key|unique/i.test(res.error)) return { ok: false, error: "They are already on this shortlist." };
    return { ok: false, error: "Couldn't add them to the shortlist. Please try again." };
  }
  refreshAssignment(ref);
  return { ok: true, id: res.id };
}

export async function updateShortlistAction(
  id: number, patch: ShortlistFields, ref?: string,
): Promise<Result> {
  // The database refuses a Declined row with no reason. Say so in English first,
  // rather than letting a constraint name reach the screen.
  if (patch.stage === "Declined" && !patch.declineReason?.trim()) {
    return { ok: false, error: "Choose why they were declined — it is the wording a fee dispute is argued in." };
  }
  const res = await updateShortlist(id, patch);
  if (!res.ok) return { ok: false, error: "Couldn't save that change. Please try again." };
  refreshAssignment(ref);
  return { ok: true, id };
}

export async function removeFromShortlistAction(id: number, ref?: string): Promise<Result> {
  const res = await removeFromShortlist(id);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id };
}

/* ─────────────────────────────────────────────────────────── interviews ──── */

export async function scheduleInterviewAction(
  shortlistId: number, kind: string, scheduledFor: string, ref?: string,
): Promise<Result> {
  const co = await agencyOrFail();
  if (!co.ok) return { ok: false, error: co.error };
  const res = await scheduleInterview(co.id, shortlistId, kind, scheduledFor);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id: res.id };
}

export async function updateInterviewAction(
  id: number, patch: { kind?: string; scheduledFor?: string | null; outcome?: string; note?: string | null }, ref?: string,
): Promise<Result> {
  const res = await updateInterview(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id };
}

/* ─────────────────────────────────────────────────────────── placements ──── */

export async function recordAcceptanceAction(
  shortlistId: number, acceptedOn: string, ref?: string,
): Promise<Result> {
  const co = await agencyOrFail();
  if (!co.ok) return { ok: false, error: co.error };
  const res = await recordAcceptance(co.id, shortlistId, acceptedOn);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id: res.id };
}

export async function recordStartAction(placementId: number, startedOn: string, ref?: string): Promise<Result> {
  const res = await recordStart(placementId, startedOn);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id: placementId };
}

export async function recordEndAction(
  placementId: number, endedOn: string, endedReason: string, fault: string, ref?: string,
): Promise<Result> {
  if (!fault) return { ok: false, error: "Whose fault it was decides whether a free replacement is due — say which." };
  const res = await recordEnd(placementId, endedOn, endedReason, fault);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id: placementId };
}

export async function clearEndAction(placementId: number, ref?: string): Promise<Result> {
  const res = await clearEnd(placementId);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id: placementId };
}

export async function recordCheckInAction(
  placementId: number, day: number, party: string, spokeOn: string, note: string, ref?: string,
): Promise<Result> {
  const co = await agencyOrFail();
  if (!co.ok) return { ok: false, error: co.error };
  const res = await recordCheckIn(co.id, placementId, day, party, spokeOn, note);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id: placementId };
}

/* ═════════════════════════════════════════════════ DELETING, FOR REAL ══════ */

export async function deleteClientAction(id: number): Promise<Result> {
  const res = await deleteClient(id);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment();
  return { ok: true, id };
}

export async function deleteCandidateAction(id: number): Promise<Result> {
  const res = await deleteCandidate(id);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment();
  return { ok: true, id };
}

export async function deleteJobOrderAction(id: number): Promise<Result> {
  const res = await deleteJobOrder(id);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment();
  return { ok: true, id };
}

export async function deleteInterviewAction(id: number, ref?: string): Promise<Result> {
  const res = await deleteInterview(id);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id };
}

export async function deletePlacementAction(id: number, ref?: string): Promise<Result> {
  const res = await deletePlacement(id);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id };
}

export async function deleteCheckInAction(id: number, ref?: string): Promise<Result> {
  const res = await deleteCheckIn(id);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id };
}

export async function updatePlacementAction(
  id: number,
  patch: { acceptedOn?: string | null; startedOn?: string | null; monthlyGrossUsd?: string | number | null; notes?: string | null },
  ref?: string,
): Promise<Result> {
  const res = await updatePlacement(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refreshAssignment(ref);
  return { ok: true, id };
}
