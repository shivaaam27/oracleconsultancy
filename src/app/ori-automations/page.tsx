import { sb } from "@/db/supabase";
import { describeRule, relativeTime, type RawRule, type NameMaps } from "./describe";
import { getAppSettings } from "@/lib/settings";
import { StudioOri } from "@/components/studio/ori/studio-ori";

export const dynamic = "force-dynamic";

/** Collect every task-id / company-id / person-id any rule references, so we
 *  resolve them all in three batched lookups (not per-rule). */
function referencedIds(rules: RawRule[]) {
  const taskIds = new Set<number>();
  const personIds = new Set<number>();
  for (const r of rules) {
    if (r.task_id != null) taskIds.add(r.task_id);
    const c = r.config ?? {};
    for (const k of ["notifyPersonId", "escalateToPersonId", "fallbackPersonId"]) {
      const v = (c as Record<string, unknown>)[k];
      if (typeof v === "number") personIds.add(v);
    }
    const assignees = (c as { assigneePersonIds?: unknown }).assigneePersonIds;
    if (Array.isArray(assignees)) for (const v of assignees) if (typeof v === "number") personIds.add(v);
    // smart_reminder — scope + audience ids live inside nested config objects.
    const scope = (c as { scope?: { personId?: unknown; taskId?: unknown } }).scope;
    if (scope) {
      if (typeof scope.personId === "number") personIds.add(scope.personId);
      if (typeof scope.taskId === "number") taskIds.add(scope.taskId);
    }
    const aud = (c as { audience?: { notifyPersonIds?: unknown } }).audience;
    if (aud && Array.isArray(aud.notifyPersonIds)) for (const v of aud.notifyPersonIds) if (typeof v === "number") personIds.add(v);
  }
  return { taskIds: [...taskIds], personIds: [...personIds] };
}

async function loadNameMaps(rules: RawRule[]): Promise<NameMaps> {
  const { taskIds, personIds } = referencedIds(rules);
  const [companiesRes, tasksRes, peopleRes] = await Promise.all([
    sb.from("companies").select("id,name"),
    taskIds.length ? sb.from("tasks").select("id,code").in("id", taskIds) : Promise.resolve({ data: [] }),
    personIds.length ? sb.from("people").select("id,name").in("id", personIds) : Promise.resolve({ data: [] }),
  ]);
  const companies = new Map<number, string>();
  for (const c of (companiesRes.data ?? []) as { id: number; name: string }[]) companies.set(c.id, c.name);
  const taskCodes = new Map<number, string>();
  for (const t of (tasksRes.data ?? []) as { id: number; code: string }[]) taskCodes.set(t.id, t.code);
  const people = new Map<number, string>();
  for (const p of (peopleRes.data ?? []) as { id: number; name: string }[]) people.set(p.id, p.name);
  return { companies, taskCodes, people };
}

/** "Create “DSC Debtor Reports” every Mon…" → "DSC Debtor Reports": the quoted
 *  name when a rule has one, else its scope line — for the watching card. */
function shortName(title: string, target: string): string {
  return /"([^"]+)"/.exec(title)?.[1] ?? target;
}

/**
 * ORI Automation — Studio (boards Ori + OriBuilder). Every standing automation
 * ORI holds, the three built-in signals, and the builder. The screen is
 * components/studio/ori/*; this page only reads.
 */
export default async function OriAutomationsPage() {
  const { data } = await sb
    .from("automation_rules")
    .select("id,kind,config,task_id,company_id,active,done,created_at,last_fired_at,last_run_at")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const rules = (data ?? []) as RawRule[];
  const [maps, peopleRes, companiesRes, settings, signalStamps] = await Promise.all([
    loadNameMaps(rules),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    sb.from("companies").select("id,name").order("name"),
    getAppSettings(),
    // Last-fired stamps: the once/day dedupe rows the checks write (date-only strings).
    sb.from("settings").select("key,value").in("key", [
      "ori.signal.quiet-staff", "ori.signal.undecided-decisions", "morningRun.lastHealthDigest",
    ]),
  ]);
  const stampMap = new Map(((signalStamps.data ?? []) as { key: string; value: string | null }[]).map((r) => [r.key, r.value]));
  const described = rules.map((r) => describeRule(r, maps));

  // The rule that fired most recently.
  let latest: { when: string; what: string } | null = null;
  let latestAt = 0;
  rules.forEach((r, i) => {
    const t = r.last_fired_at ? Date.parse(r.last_fired_at) : NaN;
    if (Number.isFinite(t) && t > latestAt) {
      latestAt = t;
      latest = { when: relativeTime(r.last_fired_at) ?? "", what: shortName(described[i].title, described[i].target) };
    }
  });

  return (
    <StudioOri
      data={{
        rules: described,
        people: (peopleRes.data ?? []) as { id: number; name: string }[],
        companies: (companiesRes.data ?? []) as { id: number; name: string }[],
        signals: {
          quietStaffEnabled: settings.signalQuietStaffEnabled,
          quietStaffDays: settings.signalQuietStaffDays,
          decisionReminderEnabled: settings.signalDecisionReminderEnabled,
          decisionReminderDays: settings.signalDecisionReminderDays,
          healthDigestEnabled: settings.signalHealthDigestEnabled,
        },
        signalsFired: {
          quietStaff: relativeTime(stampMap.get("ori.signal.quiet-staff") ?? null),
          decisionReminder: relativeTime(stampMap.get("ori.signal.undecided-decisions") ?? null),
          healthDigest: relativeTime(stampMap.get("morningRun.lastHealthDigest") ?? null),
        },
        latest,
      }}
    />
  );
}
