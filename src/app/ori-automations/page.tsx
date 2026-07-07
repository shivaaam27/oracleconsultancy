import { Sparkles, Command } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { sb } from "@/db/supabase";
import { describeRule, type RawRule, type NameMaps, type DescribedRule } from "./describe";
import { AutomationControls } from "./automation-row";

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

export default async function OriAutomationsPage() {
  const { data } = await sb
    .from("automation_rules")
    .select("id,kind,config,task_id,company_id,active,done,created_at,last_fired_at,last_run_at")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const rules = (data ?? []) as RawRule[];
  const maps = await loadNameMaps(rules);
  const described = rules.map((r) => describeRule(r, maps));

  const active = described.filter((r) => r.active);
  const paused = described.filter((r) => !r.active);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-28">
      <HrmsCrumbs />
      <PageHeader
        title="ORI Automation"
        sub="Every standing automation ORI holds — pause or cancel any of them. Read-only: this screen never starts a new action."
      />

      {described.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <RuleGroup label="Live" hint="Currently watching / scheduled" rules={active} />
          {paused.length > 0 && (
            <RuleGroup label="Paused" hint="Switched off — flip back on any time" rules={paused} muted />
          )}
        </div>
      )}
    </main>
  );
}

function RuleGroup({ label, hint, rules, muted }: { label: string; hint: string; rules: DescribedRule[]; muted?: boolean }) {
  if (rules.length === 0 && label === "Live") {
    return (
      <section className="rounded-2xl ring-1 ring-border/60 overflow-hidden">
        <GroupHeader label={label} hint="Nothing live right now" count={0} />
        <div className="px-4 py-6 text-center text-xs text-fg-muted">
          Every automation is paused. Flip one back on below.
        </div>
      </section>
    );
  }
  return (
    <section className={`rounded-2xl ring-1 ring-border/60 overflow-hidden ${muted ? "opacity-90" : ""}`}>
      <GroupHeader label={label} hint={hint} count={rules.length} />
      <ul className="divide-y divide-border/50">
        {rules.map((r) => (
          <RuleRow key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
}

function GroupHeader({ label, hint, count }: { label: string; hint: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-bg-subtle/60 px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">{label}</h2>
        <span className="text-[11px] tabular text-fg-subtle">{count}</span>
      </div>
      <span className="text-[11px] text-fg-subtle">{hint}</span>
    </div>
  );
}

function RuleRow({ r }: { r: DescribedRule }) {
  const Icon = r.icon;
  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-accent"
        style={{ backgroundColor: "color-mix(in srgb, hsl(var(--accent)) 14%, transparent)" }}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-snug text-fg">{r.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fg-muted">
          <span className="rounded px-1.5 py-0.5 ring-1 ring-border/60 bg-bg-elev">{r.kindLabel}</span>
          <span className="truncate">{r.target}</span>
          {r.lastFired && <span className="text-fg-subtle">· last fired {r.lastFired}</span>}
          {r.done && <span className="text-fg-subtle">· completed</span>}
        </div>
      </div>
      <div className="shrink-0">
        <AutomationControls id={r.id} active={r.active} />
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl ring-1 ring-border/60 bg-bg-subtle/40 px-6 py-12 text-center">
      <span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-accent/12 text-accent">
        <Sparkles size={20} />
      </span>
      <p className="text-sm font-medium text-fg">ORI isn&rsquo;t watching anything yet</p>
      <p className="mx-auto mt-1.5 max-w-sm text-xs text-fg-muted">
        Ask it in the command palette, e.g.{" "}
        <span className="text-fg">&ldquo;tell me when PES raises a blocker&rdquo;</span> — the standing rule appears here to
        pause or cancel.
      </p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
        <Command size={12} /> Open the palette with Ctrl + Space
      </p>
    </div>
  );
}
