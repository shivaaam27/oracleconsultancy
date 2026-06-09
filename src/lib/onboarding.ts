import { sb } from "@/db/supabase";
import { normalizePersonType, PERSON_TYPES, type PersonType } from "@/lib/person-types";
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

/* ------------------------------------------------------------------ */
/* Editable step templates (journey_step_templates), per person type.  */
/* Seeded once from the hard-coded defaults above; thereafter the       */
/* operator edits them in Documents → Manage onboarding steps. A        */
/* person's journey is created from / synced to these rows.             */
/* ------------------------------------------------------------------ */
type ResolvedStep = { label: string; offsetDays: number };

/** Create per-type rows from the hard-coded defaults if none exist yet. Idempotent. */
export async function seedJourneyTemplates(): Promise<{ created: number }> {
  const { count } = await sb
    .from("journey_step_templates")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return { created: 0 };

  const now = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  for (const kind of ["onboarding", "offboarding"] as JourneyKind[]) {
    for (const type of PERSON_TYPES) {
      const steps = templateFor(kind).filter((s) => !s.types || s.types.includes(type));
      steps.forEach((s, idx) => {
        rows.push({
          kind,
          applies_to_type: type,
          label: s.label,
          offset_days: s.offsetDays,
          active: true,
          sort_order: idx,
          created_at: now,
          updated_at: now,
        });
      });
    }
  }
  if (rows.length === 0) return { created: 0 };
  const { error } = await sb.from("journey_step_templates").insert(rows);
  if (error) throw new Error(error.message);
  return { created: rows.length };
}

/** Active template steps for a (kind, type), DB-first with a hard-coded fallback. */
async function resolveTemplateSteps(kind: JourneyKind, type: PersonType): Promise<ResolvedStep[]> {
  const { data } = await sb
    .from("journey_step_templates")
    .select("label,offset_days")
    .eq("kind", kind)
    .eq("applies_to_type", type)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (data && data.length > 0) {
    return data.map((r) => ({ label: r.label as string, offsetDays: (r.offset_days as number | null) ?? 0 }));
  }
  // Fallback: defaults filtered to this type (covers a not-yet-seeded table).
  return templateFor(kind)
    .filter((s) => !s.types || s.types.includes(type))
    .map((s) => ({ label: s.label, offsetDays: s.offsetDays }));
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

  const steps = await resolveTemplateSteps(kind, type);
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

/* ------------------------------------------------------------------ */
/* Per-person step customisation (add / edit / delete).                */
/* Steps are ordinary `todos` rows tagged with `kind`.                 */
/* ------------------------------------------------------------------ */
function dateInputToIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Append a custom step to a person's journey. */
export async function addJourneyStep(
  personId: number,
  kind: JourneyKind,
  input: { label: string; dueAt: string | null }
): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new Error("A step name is required.");
  const { data: last } = await sb
    .from("todos")
    .select("sort_order")
    .eq("person_id", personId)
    .eq("kind", kind)
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number | null) ?? -1) + 1;
  const { data: person } = await sb.from("people").select("company_id").eq("id", personId).maybeSingle();
  const { error } = await sb.from("todos").insert({
    title: label,
    kind,
    sort_order: nextOrder,
    person_id: personId,
    company_id: (person?.company_id as number | null) ?? null,
    due_at: dateInputToIso(input.dueAt),
    important: false,
    done: false,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Edit a journey step's name / due date. */
export async function editJourneyStep(id: number, input: { label: string; dueAt: string | null }): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new Error("A step name is required.");
  const { error } = await sb.from("todos").update({ title: label, due_at: dateInputToIso(input.dueAt) }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Delete a single journey step. */
export async function deleteJourneyStep(id: number): Promise<void> {
  const { error } = await sb.from("todos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Sync a person's journey to the current template for their type: append any
 * template steps whose label isn't already present (matched case-insensitively).
 * Mirrors "Sync with template" on the document compliance checklist. Requires an
 * existing journey — does nothing if the person has none yet.
 */
export async function syncJourneyToTemplate(
  personId: number,
  kind: JourneyKind
): Promise<{ added: number }> {
  const { data: person } = await sb
    .from("people")
    .select("person_type,start_date,company_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { added: 0 };

  const { data: existing } = await sb
    .from("todos")
    .select("id,title,sort_order")
    .eq("person_id", personId)
    .eq("kind", kind);
  if (!existing || existing.length === 0) return { added: 0 }; // No journey to sync.

  const type = normalizePersonType(person.person_type as string | null);
  const haveLabels = new Set(existing.map((r) => (r.title as string).trim().toLowerCase()));
  const steps = (await resolveTemplateSteps(kind, type)).filter(
    (s) => !haveLabels.has(s.label.trim().toLowerCase())
  );
  if (steps.length === 0) return { added: 0 };

  const anchor =
    kind === "onboarding" && person.start_date ? new Date(person.start_date as string) : new Date();
  const companyId = (person.company_id as number | null) ?? null;
  const now = new Date().toISOString();
  const baseOrder =
    Math.max(0, ...existing.map((r) => (r.sort_order as number | null) ?? 0)) + 1;

  const rows = steps.map((s, idx) => ({
    title: s.label,
    kind,
    sort_order: baseOrder + idx,
    person_id: personId,
    company_id: companyId,
    due_at: addDays(anchor, s.offsetDays).toISOString(),
    important: false,
    done: false,
    created_at: now,
  }));
  const { error } = await sb.from("todos").insert(rows);
  if (error) throw new Error(error.message);
  return { added: rows.length };
}

/**
 * Propagate onboarding/offboarding template edits to EVERYONE who already has a
 * journey: append any missing template steps for their type. Existing journeys
 * keep their progress. Returns how many journeys changed and steps added.
 */
export async function syncAllJourneys(): Promise<{ journeys: number; added: number }> {
  const { data: rows } = await sb.from("todos").select("person_id,kind").not("kind", "is", null);
  const pairs = new Map<string, { personId: number; kind: JourneyKind }>();
  for (const r of rows ?? []) {
    const kind = r.kind as string;
    if (kind !== "onboarding" && kind !== "offboarding") continue;
    if (r.person_id == null) continue;
    pairs.set(`${r.person_id}:${kind}`, { personId: r.person_id as number, kind: kind as JourneyKind });
  }
  let journeys = 0;
  let added = 0;
  for (const { personId, kind } of pairs.values()) {
    const res = await syncJourneyToTemplate(personId, kind);
    if (res.added > 0) {
      journeys++;
      added += res.added;
    }
  }
  return { journeys, added };
}

/* ------------------------------------------------------------------ */
/* Template CRUD — edited in Documents → Manage onboarding steps.       */
/* Adds propagate to people on their next journey sync; edits/deletes   */
/* do not rewrite journeys already created.                             */
/* ------------------------------------------------------------------ */
export type JourneyTemplateStep = { id: number; label: string; offsetDays: number; sortOrder: number };
export type JourneyTemplateGroup = {
  kind: JourneyKind;
  appliesToType: PersonType;
  steps: JourneyTemplateStep[];
};

/** All active template steps, grouped by kind + person type. Seeds defaults first. */
export async function listJourneyTemplates(): Promise<JourneyTemplateGroup[]> {
  await seedJourneyTemplates();
  const { data } = await sb
    .from("journey_step_templates")
    .select("id,kind,applies_to_type,label,offset_days,sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const groups: JourneyTemplateGroup[] = [];
  const index = new Map<string, JourneyTemplateGroup>();
  const keyOf = (kind: JourneyKind, type: PersonType) => `${kind}:${type}`;
  for (const kind of ["onboarding", "offboarding"] as JourneyKind[]) {
    for (const type of PERSON_TYPES) {
      const group: JourneyTemplateGroup = { kind, appliesToType: type, steps: [] };
      index.set(keyOf(kind, type), group);
      groups.push(group);
    }
  }
  for (const r of data ?? []) {
    const kind = (r.kind as string) === "offboarding" ? "offboarding" : "onboarding";
    const type = normalizePersonType(r.applies_to_type as string | null);
    const group = index.get(keyOf(kind as JourneyKind, type));
    if (!group) continue;
    group.steps.push({
      id: r.id as number,
      label: r.label as string,
      offsetDays: (r.offset_days as number | null) ?? 0,
      sortOrder: (r.sort_order as number | null) ?? 0,
    });
  }
  return groups;
}

export async function addJourneyTemplateStep(
  kind: JourneyKind,
  appliesToType: PersonType,
  input: { label: string; offsetDays: number }
): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new Error("A step name is required.");
  const { data: last } = await sb
    .from("journey_step_templates")
    .select("sort_order")
    .eq("kind", kind)
    .eq("applies_to_type", appliesToType)
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number | null) ?? -1) + 1;
  const now = new Date().toISOString();
  const { error } = await sb.from("journey_step_templates").insert({
    kind,
    applies_to_type: appliesToType,
    label,
    offset_days: Number.isFinite(input.offsetDays) ? Math.max(0, Math.trunc(input.offsetDays)) : 0,
    active: true,
    sort_order: nextOrder,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
}

export async function editJourneyTemplateStep(
  id: number,
  input: { label: string; offsetDays: number }
): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new Error("A step name is required.");
  const { error } = await sb
    .from("journey_step_templates")
    .update({
      label,
      offset_days: Number.isFinite(input.offsetDays) ? Math.max(0, Math.trunc(input.offsetDays)) : 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteJourneyTemplateStep(id: number): Promise<void> {
  const { error } = await sb.from("journey_step_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
