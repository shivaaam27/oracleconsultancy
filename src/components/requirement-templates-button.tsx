"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ListChecks, Plus, Pencil, Trash2, Check, Info, RefreshCw } from "lucide-react";
import { Badge, Button } from "./ui";
import { EntityDrawer, type DrawerTab } from "./entity-drawer";
import { useToast } from "./toast";
import { DOC_CATEGORIES } from "@/lib/documents-shared";
import { tmplAddItem, tmplEditItem, tmplDeleteItem, tmplSyncEveryone } from "@/app/documents/template-actions";

type Item = { id: number; label: string; category: string | null; mandatory: boolean; sortOrder: number };
type Profile = { id: number; name: string; appliesToType: string; description: string | null; items: Item[] };
type Fields = { label: string; category: string | null; mandatory: boolean };

function ItemEditor({ initial, onSave, onCancel, busy }: {
  initial?: Fields;
  onSave: (v: Fields) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? true);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-bg-subtle/60 px-2.5 py-2.5 ring-1 ring-border/60">
      <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) onSave({ label: label.trim(), category: category || null, mandatory }); if (e.key === "Escape") onCancel(); }}
        placeholder="Document name"
        className="rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-md bg-bg-elev text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1">
          <option value="">No category</option>
          {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer">
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="accent-accent" /> Required
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onCancel} disabled={busy}
            className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">Cancel</button>
          <Button type="button" disabled={busy || !label.trim()} loading={busy} size="xs"
            onClick={() => onSave({ label: label.trim(), category: category || null, mandatory })}>
            {!busy && <Check size={11} />} Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RequirementTemplatesButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingProfile, setAddingProfile] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/requirement-templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load templates"))))
      .then((d: { profiles: Profile[] }) => {
        setProfiles(d.profiles);
        setActiveTab((cur) => cur || (d.profiles[0] ? String(d.profiles[0].id) : ""));
      })
      .catch(() => setProfiles(null))
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
      const res = await tmplSyncEveryone();
      setSyncing(false);
      if (!res.ok) { toast(res.error ?? "Could not sync", { tone: "danger" }); return; }
      setDirty(false);
      toast(`Saved — applied to ${res.people} ${res.people === 1 ? "person" : "people"}.`, { tone: "success" });
    });
  }

  function renderProfileBody(profile: Profile) {
    return (
      <div className="glass elevated rounded-2xl overflow-hidden">
        {profile.description && (
          <div className="px-3.5 py-2 border-b border-border/70 text-[11px] text-fg-muted">{profile.description}</div>
        )}
        <div className="divide-y divide-border/50">
          {profile.items.map((item) =>
            editingId === item.id ? (
              <div key={item.id} className="p-2">
                <ItemEditor
                  initial={{ label: item.label, category: item.category, mandatory: item.mandatory }}
                  busy={busyId === item.id}
                  onCancel={() => setEditingId(null)}
                  onSave={(v) => run(item.id, () => tmplEditItem(item.id, v), "Updated.", () => setEditingId(null))}
                />
              </div>
            ) : (
              <div key={item.id} className={cnRow(busyId === item.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{item.label}</span>
                  <span className="block text-[11px] text-fg-subtle">
                    {[item.category, item.mandatory ? "Required" : "Optional"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {!item.mandatory && <Badge tone="default">Optional</Badge>}
                <button type="button" disabled={busyId === item.id} onClick={() => setEditingId(item.id)} aria-label="Edit"
                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-fg-subtle hover:text-accent hover:bg-bg-muted transition-colors disabled:opacity-50">
                  <Pencil size={12} />
                </button>
                <button type="button" disabled={busyId === item.id} onClick={() => run(item.id, () => tmplDeleteItem(item.id), "Removed.")} aria-label="Delete"
                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50">
                  <Trash2 size={12} />
                </button>
              </div>
            )
          )}
          {addingProfile === profile.id ? (
            <div className="p-2">
              <ItemEditor
                busy={busyId === -profile.id}
                onCancel={() => setAddingProfile(null)}
                onSave={(v) => run(-profile.id, () => tmplAddItem(profile.id, v), "Added.", () => setAddingProfile(null))}
              />
            </div>
          ) : (
            <button type="button" onClick={() => { setEditingId(null); setAddingProfile(profile.id); }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-[11px] font-medium text-accent hover:bg-bg-muted/40 transition-colors">
              <Plus size={13} /> Add a required document
            </button>
          )}
        </div>
      </div>
    );
  }

  const tabs: DrawerTab[] = (profiles ?? []).map((p) => ({
    id: String(p.id),
    label: p.name,
    badge: p.items.length,
    content: renderProfileBody(p),
  }));

  const hero = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft/60 text-accent ring-1 ring-accent/20">
          <ListChecks size={17} />
        </span>
        <div>
          <div className="text-sm font-semibold">Document requirement templates</div>
          <div className="text-[11px] text-fg-muted">The default checklist for each kind of person.</div>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-xl bg-info-soft/40 ring-1 ring-info/20 px-3 py-2 text-[11px] text-fg-muted">
        <Info size={13} className="mt-0.5 shrink-0 text-info" />
        <span>New items are added to everyone of that type on their next visit. People already on record keep what they have — edits and removals here don&apos;t rewrite their existing checklists.</span>
      </div>
    </div>
  );

  const actionBar = (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-fg-muted">
        {dirty ? "Unsaved changes — save to apply to everyone." : "Edits auto-save to the template."}
      </span>
      <Button type="button" onClick={syncEveryone} disabled={syncing} loading={syncing} size="sm">
        {!syncing && <RefreshCw size={13} />}
        Save &amp; sync to everyone
      </Button>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg-subtle/60 px-3 py-2 text-sm text-fg-muted hover:text-fg hover:border-accent transition-colors">
        <ListChecks size={15} /> Manage requirements
      </button>
      <EntityDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Document requirement templates"
        hero={hero}
        tabs={tabs.length ? tabs : [{ id: "loading", label: "Templates", content: <div /> }]}
        activeTab={tabs.length ? activeTab || tabs[0].id : "loading"}
        onTabChange={setActiveTab}
        actionBar={actionBar}
        loading={loading && !profiles}
        maxWidth="640px"
        fullScreenOnMobile
      />
    </>
  );
}

function cnRow(busy: boolean) {
  return `flex items-center gap-2 px-3.5 py-2 ${busy ? "opacity-60" : ""}`;
}
