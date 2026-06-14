"use client";

import { useEffect, useState, useTransition } from "react";
import { NotebookPen, ChevronDown, Plus, Check, Trash2, FileText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { SectionCard, StatusChip, type KitTone } from "./drawer-kit";
import { Combobox } from "./combobox";
import {
  factStatus,
  renderFactValue,
  FACT_STATUS_LABEL,
  COMMON_FACT_FIELDS,
  type Fact,
  type FactStatus,
  type FactEntityType,
} from "@/lib/facts-shared";
import {
  loadEntityFacts,
  recordFactAction,
  verifyFactAction,
  deleteFactAction,
} from "@/app/facts/actions";

const STATUS_TONE: Record<FactStatus, KitTone> = {
  verified: "success",
  unverified: "muted",
  stale: "warn",
  incomplete: "danger",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * "Tracked facts" — the fact-ledger panel, shared by the person drawer and the
 * company profile. Shows the current value of each field (latest effective date),
 * its freshness, the proving source, and a per-field history; lets the operator
 * record a new value (which adds a row, never overwrites) and verify/remove one.
 */
export function FactsPanel({
  entityType,
  entityId,
}: {
  entityType: FactEntityType;
  entityId: number;
}) {
  const [current, setCurrent] = useState<Fact[]>([]);
  const [all, setAll] = useState<Fact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openField, setOpenField] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  async function refresh() {
    const { current, all } = await loadEntityFacts(entityType, entityId);
    setCurrent(current);
    setAll(all);
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  return (
    <SectionCard className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5">
          <NotebookPen size={12} /> Tracked facts
        </span>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-bg-subtle/60 px-2 py-1 text-[11px] font-medium text-fg-muted hover:bg-bg-muted/60 transition-colors"
        >
          <Plus size={12} /> Record a fact
        </button>
      </div>

      {adding && (
        <RecordForm
          entityType={entityType}
          entityId={entityId}
          onDone={() => {
            setAdding(false);
            startTransition(() => void refresh());
          }}
        />
      )}

      {!loaded ? (
        <p className="text-[12px] text-fg-subtle">Loading…</p>
      ) : current.length === 0 ? (
        <p className="text-[12px] text-fg-subtle">
          No facts recorded yet. Use “Record a fact” to log a salary, shareholding, bank account or other detail —
          each one keeps its history and points to the document that proves it.
        </p>
      ) : (
        <div className="space-y-1.5">
          {current.map((f) => {
            const status = factStatus(f);
            const history = all.filter((x) => x.field === f.field);
            const expandable = history.length > 1;
            const open = openField === f.field;
            return (
              <div key={f.id} className="rounded-lg bg-bg-subtle/40">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    disabled={!expandable}
                    onClick={() => setOpenField(open ? null : f.field)}
                    className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", expandable && "cursor-pointer")}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-fg truncate">{f.field}</span>
                      <span className="block text-[11px] text-fg-muted truncate">
                        {f.display ?? renderFactValue(f.field, f.value)}
                      </span>
                    </span>
                    {expandable && (
                      <ChevronDown size={13} className={cn("ml-1 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
                    )}
                  </button>
                  <StatusChip tone={STATUS_TONE[status]}>{FACT_STATUS_LABEL[status]}</StatusChip>
                  <FactActions
                    fact={f}
                    entityType={entityType}
                    entityId={entityId}
                    onChange={() => startTransition(() => void refresh())}
                  />
                </div>

                {open && expandable && (
                  <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">History</p>
                    {history.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 text-[12px]">
                        <span className="text-fg-muted tabular w-20 shrink-0">{fmtDate(h.effectiveDate)}</span>
                        <span className="text-fg truncate flex-1">{h.display ?? renderFactValue(h.field, h.value)}</span>
                        {h.source && <span className="text-[10px] text-fg-subtle inline-flex items-center gap-0.5"><FileText size={10} /> {h.source}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Current-row footer: source + effective date, calm and small. */}
                {(f.source || f.effectiveDate) && (
                  <div className="flex items-center gap-2 px-3 pb-2 text-[10px] text-fg-subtle">
                    <span>as at {fmtDate(f.effectiveDate)}</span>
                    {f.source && <span className="inline-flex items-center gap-0.5"><FileText size={10} /> {f.source}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function FactActions({
  fact,
  entityType,
  entityId,
  onChange,
}: {
  fact: Fact;
  entityType: FactEntityType;
  entityId: number;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function verify() {
    setBusy(true);
    await verifyFactAction(fact.id, !fact.verified, entityType, entityId);
    setBusy(false);
    onChange();
  }
  async function remove() {
    if (!confirm("Remove this fact entry? Use this only to fix a mistake — to record a change, add a new value instead.")) return;
    setBusy(true);
    await deleteFactAction(fact.id, entityType, entityId);
    setBusy(false);
    onChange();
  }
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        disabled={busy}
        onClick={verify}
        title={fact.verified ? "Mark unverified" : "Mark verified"}
        className={cn(
          "rounded-md p-1 transition-colors hover:bg-bg-muted/70",
          fact.verified ? "text-success" : "text-fg-subtle"
        )}
      >
        {fact.verified ? <ShieldCheck size={13} /> : <Check size={13} />}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        title="Remove entry"
        className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 size={13} />
      </button>
    </span>
  );
}

function RecordForm({
  entityType,
  entityId,
  onDone,
}: {
  entityType: FactEntityType;
  entityId: number;
  onDone: () => void;
}) {
  const [field, setField] = useState("");
  const [valueText, setValueText] = useState("");
  const [source, setSource] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [verified, setVerified] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const input = "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent/60";

  async function save() {
    setSaving(true);
    setError(null);
    const res = await recordFactAction({
      entityType,
      entityId,
      field,
      valueText,
      source: source || undefined,
      effectiveDate: effectiveDate || undefined,
      verified,
      note: note || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't save.");
      return;
    }
    onDone();
  }

  return (
    <div className="rounded-lg border border-border/70 bg-bg-subtle/30 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Combobox
          options={[...COMMON_FACT_FIELDS]}
          placeholder="Fact (e.g. Salary)"
          onInput={setField}
          onCommit={setField}
          className="text-[13px]"
        />
        <input
          className={input}
          placeholder="Value"
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className={input}
          placeholder="Source (e.g. BRELA report)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <input
          type="date"
          className={input}
          title="Effective date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
        />
      </div>
      <input
        className={input}
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted cursor-pointer">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="accent-accent" />
          Verified against the source
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onDone} className="rounded-lg px-2.5 py-1 text-[12px] text-fg-muted hover:bg-bg-muted/60">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-1 text-[12px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Record"}
          </button>
        </div>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
