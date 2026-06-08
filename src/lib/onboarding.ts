import { sb } from "@/db/supabase";
import { normalizePersonType, type PersonType } from "@/lib/person-types";
import { type Journey, type JourneyKind, type JourneyStep } from "@/lib/onboarding-shared";

/* ------------------------------------------------------------------ */
/* Onboarding & Offboarding journeys.                                  */
/*                                                                     */
/* Reuse-don't-duplicate: a journey is just a set of rows in the       */
/* existing `todos` table, tagged with `kind` ("onboarding" |          */
/* "offboarding") and ordered by `sort_order`. They live alongside     */
/* ordinary to-dos (so they show in the Workbook and reminders work)   */
/* but the drawer can group them and show progress. Document collection*/
/* stays in the requirements checklist (Phase 2); equipment links to   */
/* OECR until full asset assignment lands (Phase 5).                   */
/*                                                                     */
/* Client-safe types + labels live in lib/onboarding-shared.ts.        */
/* ------------------------------------------------------------------ */
export type { Journey, JourneyKind, JourneyStep } from "@/lib/onboarding-shared";
export { JOURNEY_LABELS } from "@/lib/onboarding-shared";

type StepTemplate = {
  label: string;
  /** Days from the anchor date (start date for onboarding, today for offboarding). */
  offsetDays: number;
  /** Limit a step to certain person types; omitted = all. */
  types?: PersonType[];
};

const ONBOARDING_STEPS: StepTemplate[] = [
  { label: "Collect & verify all required documents", offsetDays: 0 },
  { label: "Sign & file employment contract", offsetDays: 0 },
  { label: "Set up payroll & bank details", offsetDays: 2 },
  { label: "Register statutory (NSSF / TIN / NHIF)", offsetDays: 5, types: ["local_staff"] },
  { label: "Confirm work permit & visa are valid", offsetDays: 0, types: ["expat"] },
  { label: "Issue equipment (laptop, phone, access card) via Asset Register", offsetDays: 1 },
  { label: "Create email & system accounts", offsetDays: 1 },
  { label: "Add to team groups & make introductions", offsetDays: 1 },
  { label: "Orientation & induction (policies, safety, tools)", offsetDays: 2 },
  { label: "First-week check-in", offsetDays: 7 },
  { label: "Confirm probation period & review date", offsetDays: 7 },
];

const OFFBOARDING_STEPS: StepTemplate[] = [
  { label: "Collect handover notes & reassign open work", offsetDays: 0 },
  { label: "Return equipment via Asset Register (laptop, phone, access card)", offsetDays: 1 },
  { label: "Revoke email & system accounts", offsetDays: 1 },
  { label: "Final pay & settlement", offsetDays: 3 },
  { label: "Archive documents & issue exit letter", offsetDays: 3 },
  { label: "Exit interview", offsetDays: 2 },
  { label: "Remove from groups & distribution lists", offsetDays: 1 },
];

/** Person types that get an onboarding journey auto-created on add. */
export const AUTO_ONBOARD_TYPES: PersonType[] = ["local_staff", "expat"];

function templateFor(kind: JourneyKind): StepTemplate[] {
  return kind === "onboarding" ? ONBOARDING_STEPS : OFFBOARDING_STEPS;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Create a person's journey checklist if they don't already have one.
 * Idempotent: if any rows of this kind exist for the person, does nothing.
 */
export async function startJourney(
  personId: number,
  kind: JourneyKind
): Promise<{ created: number; alreadyExisted: boolean }> {
  const { data: existing } = await sb
    .from("todos")
    .select("id")
    .eq("person_id", personId)
    .eq("kind", kind)
    .limit(1);
  if (existing && existing.length > 0) return { created: 0, alreadyExisted: true };

  const { data: person } = await sb
    .from("people")
    .select("person_type,start_date,company_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { created: 0, alreadyExisted: false };

  const type = normalizePersonType(person.person_type as string | null);
  const anchor =
    kind === "onboarding" && person.start_date
      ? new Date(person.start_date as string)
      : new Date();
  const companyId = (person.company_id as number | null) ?? null;
  const now = new Date().toISOString();

  const steps = templateFor(kind).filter((s) => !s.types || s.types.includes(type));
  const rows = steps.map((s, idx) => ({
    title: s.label,
    kind,
    sort_order: idx,
    person_id: personId,
    company_id: companyId,
    due_at: addDays(anchor, s.offsetDays).toISOString(),
    important: false,
    done: false,
    created_at: now,
  }));
  if (rows.length === 0) return { created: 0, alreadyExisted: false };

  const { error } = await sb.from("todos").insert(rows);
  if (error) throw new Error(error.message);
  return { created: rows.length, alreadyExisted: false };
}

/** Read a person's journey of a given kind (or null if none exists). */
export async function getJourney(personId: number, kind: JourneyKind): Promise<Journey | null> {
  const { data } = await sb
    .from("todos")
    .select("id,title,done,due_at,sort_order")
    .eq("person_id", personId)
    .eq("kind", kind)
    .order("sort_order", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true });
  if (!data || data.length === 0) return null;

  const steps: JourneyStep[] = data.map((r) => ({
    id: r.id as number,
    label: r.title as string,
    done: (r.done as boolean | null) ?? false,
    dueAt: (r.due_at as string | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? 0,
  }));
  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    kind,
    steps,
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** Remove an entire journey (all its steps) for a person. */
export async function clearJourney(personId: number, kind: JourneyKind): Promise<void> {
  const { error } = await sb.from("todos").delete().eq("person_id", personId).eq("kind", kind);
  if (error) throw new Error(error.message);
}
