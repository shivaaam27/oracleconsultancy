"use server";

import { revalidatePath } from "next/cache";
import {
  acceptProfileSuggestion,
  dismissProfileSuggestion,
  undoProfileSuggestion,
  listProfileSuggestions,
  type ProfileSuggestion,
} from "@/lib/profile-suggestions";

function revalidateOwner(s: { companyId: number | null; personId: number | null }) {
  if (s.companyId) revalidatePath(`/companies/${s.companyId}`);
  revalidatePath("/people");
  revalidatePath("/documents");
  revalidatePath("/");
}

/** Pending suggestions for a company (for the profile tray). */
export async function getCompanySuggestionsAction(companyId: number): Promise<ProfileSuggestion[]> {
  return listProfileSuggestions({ companyId, status: "pending" });
}

/** Pending suggestions for a person (for the drawer tray). */
export async function getPersonSuggestionsAction(personId: number): Promise<ProfileSuggestion[]> {
  return listProfileSuggestions({ personId, status: "pending" });
}

export async function acceptSuggestionAction(
  id: number
): Promise<{ ok: boolean; error?: string }> {
  const list = await listProfileSuggestions({ status: "pending" });
  const s = list.find((x) => x.id === id);
  const res = await acceptProfileSuggestion(id);
  if (res.ok && s) revalidateOwner(s);
  return res;
}

export async function dismissSuggestionAction(id: number): Promise<{ ok: boolean }> {
  const list = await listProfileSuggestions({ status: "pending" });
  const s = list.find((x) => x.id === id);
  const res = await dismissProfileSuggestion(id);
  if (s) revalidateOwner(s);
  return res;
}

/** Undo an auto-applied change (revert a blank field / delete the auto fact). */
export async function undoSuggestionAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const list = await listProfileSuggestions({ status: "applied" });
  const s = list.find((x) => x.id === id);
  const res = await undoProfileSuggestion(id);
  if (res.ok && s) revalidateOwner(s);
  return res;
}

/** Accept every pending suggestion for an owner in one tap. */
export async function acceptAllSuggestionsAction(opts: {
  companyId?: number;
  personId?: number;
}): Promise<{ ok: boolean; accepted: number }> {
  const list = await listProfileSuggestions({ ...opts, status: "pending" });
  let accepted = 0;
  for (const s of list) {
    const res = await acceptProfileSuggestion(s.id);
    if (res.ok) accepted++;
  }
  if (list[0]) revalidateOwner(list[0]);
  return { ok: true, accepted };
}
