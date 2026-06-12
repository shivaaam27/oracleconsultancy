import { sb } from "@/db/supabase";
import type { PersonAction, PersonEvent } from "@/lib/person-audit-shared";

// Append-only audit trail for a person record. Writing never blocks the user
// action (best-effort). Client-safe types/labels live in person-audit-shared.ts.
export type { PersonAction, PersonEvent } from "@/lib/person-audit-shared";
export { PERSON_ACTION_LABEL, personActor } from "@/lib/person-audit-shared";

type LogOpts = {
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  detail?: string | null;
  createdBy?: string;
};

async function insert(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await sb.from("person_events").insert(rows);
  } catch {
    /* never block the user action on an audit write */
  }
}

export async function logPersonEvent(personId: number, action: PersonAction, opts: LogOpts = {}): Promise<void> {
  await insert([
    {
      person_id: personId,
      action,
      field: opts.field ?? null,
      old_value: opts.oldValue ?? null,
      new_value: opts.newValue ?? null,
      detail: opts.detail ?? null,
      created_at: new Date().toISOString(),
      created_by: opts.createdBy ?? "web-ui",
    },
  ]);
}

export type FieldChange = { field: string; oldValue: string | null; newValue: string | null };

/** Log a batch of "updated" field changes in one insert. */
export async function logPersonFieldChanges(
  personId: number,
  changes: FieldChange[],
  createdBy = "web-ui"
): Promise<void> {
  const now = new Date().toISOString();
  await insert(
    changes.map((c) => ({
      person_id: personId,
      action: "updated",
      field: c.field,
      old_value: c.oldValue,
      new_value: c.newValue,
      detail: null,
      created_at: now,
      created_by: createdBy,
    }))
  );
}

/** Read a person's audit trail, newest first. */
export async function listPersonEvents(personId: number, limit = 40): Promise<PersonEvent[]> {
  const { data } = await sb
    .from("person_events")
    .select("id,action,field,old_value,new_value,detail,created_at,created_by")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    action: r.action as PersonAction,
    field: (r.field as string | null) ?? null,
    oldValue: (r.old_value as string | null) ?? null,
    newValue: (r.new_value as string | null) ?? null,
    detail: (r.detail as string | null) ?? null,
    createdAt: r.created_at as string,
    createdBy: (r.created_by as string | null) ?? null,
  }));
}
