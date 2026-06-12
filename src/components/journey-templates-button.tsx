"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Rocket, Loader2, Plus, Pencil, Trash2, Check, Info, RefreshCw } from "lucide-react";
import { EntityDrawer, type DrawerTab } from "./entity-drawer";
import { useToast } from "./toast";
import { JOURNEY_LABELS, type JourneyKind } from "@/lib/onboarding-shared";
import { PERSON_TYPE_LABELS, PERSON_TYPES, type PersonType } from "@/lib/person-types";
import { journeyTmplAddStep, journeyTmplEditStep, journeyTmplDeleteStep, journeyTmplSyncEveryone } from "@/app/documents/template-actions";

type Step = { id: number; label: string; offsetDays: number; sortOrder: number };
type Group = { kind: JourneyKind; appliesToType: PersonType; steps: Step[] };
type Fields = { label: string; offsetDays: number };

function offsetLabel(days: number) {
  if (days <= 0) return "Day 0";
  return `Day +${days}`;
}

function StepEditor({ initial, onSave, onCancel, busy }: {
  initial?: Fields;
  onSave: (v: Fields) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [offset, setOffset] = useState(String(initial?.offsetDays ?? 0));
  const submit = () => { if (label.trim()) onSave({ label: label.trim(), offsetDays: parseInt(offset, 10) || 0 }); };
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-bg-subtle/60 px-2.5 py-2.5 ring-1 ring-border/60">
      <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        placeholder="Step (e.g. Hand over door keys)"
        className="rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
          Due day
          <input type="number" min={0} value={offset} onChange={(e) => setOffset(e.target.value)}
            className="w-16 rounded-md bg-bg-elev text-[11px] ring-1 ring-border px-1.5 py-1" />
        </label>
        <span className="text-[11px] text-fg-subtle">days from start date</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onCancel} disabled={busy}
            className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy || !label.trim()} onClick={submit}
            className="inline-flex items-center gap-1 rounded-md bg-accent text-accent-fg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function JourneyTemplatesButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<JourneyKind>("onboarding");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingType, setAddingType] = useState<PersonType | null>(null);
  const [dirty, setDirty] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(PERSON_TYPES[0]);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/journey-templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load templates"))))
      .then((d: { groups: Group[] }) => setGroups(d.groups))
      .catch(() => setGroups(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  function run(busyKey: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, after?: () => void) {
    setBusyId(busyKey);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) { toast(res.error ?? "Something went wrong", { tone: "danger" }); return; }
      toast(okMsg, { tone: "success" });
      setDirty(true);
      after?.();
      load();
    });
  }

  function syncEveryone() {
    setSyncing(true);
    startTransition(async () => {
      const res = await journeyTmplSyncEveryone();
      setSyncing(false);
      if (!res.ok) { toast(res.error ?? "Could not sync", { tone: "danger" }); return; }
      setDirty(false);
      toast(res.added === 0 ? "Saved — everyone already up to date." : `Saved — added ${res.added} step${res.added === 1 ? "" : "s"} across ${res.journeys} ${res.journeys === 1 ? "journey" : "journeys"}.`, { tone: "success" });
    });
  }

  const visible = (groups ?? []).filter((g) => g.kind === kind);

  function renderTypeSteps(type: PersonType) {
    const group = visible.find((g) => g.appliesToType === type);
    const steps = group?.steps ?? [];
    return (
      <div className="glass elevated rounded-2xl overflow-hidden">
        <div className="divide-y divide-border/50">
          {steps.map((step) =>
            editingId === step.id ? (
              <div key={step.id} className="p-2">
                <StepEditor
                  initial={{ label: step.label, offsetDays: step.offsetDays }}
                  busy={busyId === step.id}
                  onCancel={() => setEditingId(null)}
                  onSave={(v) => run(step.id, () => journeyTmplEditStep(step.id, v), "Updated.", () => setEditingId(null))}
                />
              </div>
            ) : (
              <div key={step.id} className={`flex items-center gap-2 px-3.5 py-2 ${busyId === step.id ? "opacity-60" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{step.label}</span>
                  <span className="block text-[11px] text-fg-subtle">{offsetLabel(step.offsetDays)}</span>
                </span>
                <button type="button" disabled={busyId === step.id} onClick={() => { setAddingType(null); setEditingId(step.id); }} aria-label="Edit"
                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-fg-subtle hover:text-accent hover:bg-bg-muted transition-colors disabled:opacity-50">
                  <Pencil size={12} />
                </button>
                <button type="button" disabled={busyId === step.id} onClick={() => run(step.id, () => journeyTmplDeleteStep(step.id), "Removed.")} aria-label="Delete"
                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50">
                  <Trash2 size={12} />
                </button>
              </div>
            )
          )}
          {addingType === type ? (
            <div className="p-2">
              <StepEditor
                busy={busyId === -1}
                onCancel={() => setAddingType(null)}
                onSave={(v) => run(-1, () => journeyTmplAddStep(kind, type, v), "Added.", () => setAddingType(null))}
              />
            </div>
          ) : (
            <button type="button" onClick={() => { setEditingId(null); setAddingType(type); }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-[11px] font-medium text-accent hover:bg-bg-muted/40 transition-colors">
              <Plus size={13} /> Add a step
            </button>
          )}
        </div>
      </div>
    );
  }

  const tabs: DrawerTab[] = PERSON_TYPES.map((type) => ({
    id: type,
    label: PERSON_TYPE_LABELS[type],
    badge: visible.find((g) => g.appliesToType === type)?.steps.length ?? 0,
    content: renderTypeSteps(type),
  }));

  const hero = (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft/60 text-accent ring-1 ring-accent/20">
          <Rocket size={17} />
        </span>
        <div>
          <div className="text-sm font-semibold">Onboarding &amp; offboarding steps</div>
          <div className="text-[11px] text-fg-muted">The default journey for each kind of person.</div>
        </div>
      </div>
      <div className="inline-flex w-full rounded-xl bg-bg-subtle p-1 ring-1 ring-border/60">
        {(["onboarding", "offboarding"] as JourneyKind[]).map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); setEditingId(null); setAddingType(null); }}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${kind === k ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}>
            {JOURNEY_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 rounded-xl bg-info-soft/40 ring-1 ring-info/20 px-3 py-2 text-[11px] text-fg-muted">
        <Info size={13} className="mt-0.5 shrink-0 text-info" />
        <span>New steps are added to a person on their next sync. People already on a journey keep what they have — edits and removals here don&apos;t rewrite their existing checklists.</span>
      </div>
    </div>
  );

  const actionBar = (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-fg-muted">
        {dirty ? "Unsaved changes — save to apply to everyone." : "Edits auto-save to the template."}
      </span>
      <button type="button" onClick={syncEveryone} disabled={syncing}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
        {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        Save &amp; sync to everyone
      </button>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg-subtle/60 px-3 py-2 text-sm text-fg-muted hover:text-fg hover:border-accent transition-colors">
        <Rocket size={15} /> Manage onboarding steps
      </button>
      <EntityDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Onboarding and offboarding steps"
        hero={hero}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actionBar={actionBar}
        loading={loading && !groups}
        maxWidth="640px"
        fullScreenOnMobile
      />
    </>
  );
}
