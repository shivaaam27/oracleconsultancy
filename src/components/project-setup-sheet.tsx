"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT SETUP — the masters, on one quiet surface (Phase 7).
//
// ERPNext is masters + transactions. This is the masters half: the six lists a
// project runs on. They belong to THIS project (the owner's decision), which is
// what "Copy from another project" is for.
//
// ── ⚠️ WHY THIS IS ONE SURFACE AND NOT NINE CARDS ────────────────────────────
// The first version drew every list in its own bordered card — six of those plus
// currency, starter, copy and danger, all on one screen. The owner's words were
// "so much boxes, and borders". Desk's rule is **hairlines separate, shadows
// only float** (DESIGN_SYSTEM.md), and a border round something that is not
// floating is just noise. So: ONE card, a row of chips to choose the list, and
// only that list on screen. Nine boxes became one.
//
// ── ⚠️ SETUP IS NOT THE ONLY WAY IN ──────────────────────────────────────────
// Every dropdown that reads these lists can also ADD to them, right where you
// are typing (see `Combobox onCreate` and `ChipPicker`). This page is for
// tidying — renaming, merging, retiring — not the only door. If you find
// yourself coming here mid-entry, something else is wrong.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Sparkles, Copy, Plus, Pencil, Check, X, Trash2, GitMerge, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect } from "./fluid-select";
import { CURRENCIES, currencyLabel } from "@/lib/money-format";
import { REF_KINDS, type ProjectRef } from "@/lib/project-refs-shared";
import {
  createRefAction, renameRefAction, mergeRefsAction, deleteRefAction,
  seedStarterListsAction, copyRefsFromAction, setProjectCurrencyAction,
  discardProjectDataAction,
} from "@/app/projects/[id]/setup/actions";

type Res = { ok: boolean; error?: string; note?: string };

export function ProjectSetupSheet({
  projectId, refs, currency, otherProjects, counts,
}: {
  projectId: number;
  refs: ProjectRef[];
  currency: string;
  otherProjects: Array<{ id: number; name: string }>;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>(REF_KINDS[0].kind);
  const [copyFrom, setCopyFrom] = useState("");
  const [showMore, setShowMore] = useState(false);

  const byKind = useMemo(() => {
    const m = new Map<string, ProjectRef[]>();
    for (const r of refs) {
      const list = m.get(r.kind) ?? [];
      list.push(r);
      m.set(r.kind, list);
    }
    return m;
  }, [refs]);

  const meta = REF_KINDS.find((k) => k.kind === kind)!;
  const items = byKind.get(kind) ?? [];
  const totalRows = Object.values(counts).reduce((s, n) => s + n, 0);

  const run = (fn: () => Promise<Res>) =>
    start(async () => {
      setError(null); setNote(null);
      const res = await fn();
      if (!res.ok) { setError(res.error ?? "That didn't work."); return; }
      if (res.note) setNote(res.note);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {/* ── currency: one line, no box ── */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
        <span className="text-fg-muted">Currency</span>
        <FluidSelect
          value={currency}
          options={CURRENCIES.map((c) => ({ value: c.code, label: currencyLabel(c.code) }))}
          onSelect={(v) => run(() => setProjectCurrencyAction(projectId, v))}
          buttonClassName="h-7"
        />
        <span className="text-[11px] text-fg-subtle">
          Every amount on this project shows in it. No conversion.
        </span>
      </div>

      {(note || error) && (
        <p role="alert" className={cn("rounded-md px-2.5 py-1.5 text-[12px]",
          error ? "bg-danger-soft text-danger" : "bg-bg-subtle text-fg-muted")}>
          {error ?? note}
        </p>
      )}

      {/* ── the one card ── */}
      <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
        {/* which list */}
        <div className="flex flex-wrap gap-1 border-b border-border bg-bg-subtle px-2 py-1.5">
          {REF_KINDS.map((k) => {
            const n = (byKind.get(k.kind) ?? []).filter((r) => r.active).length;
            return (
              <button key={k.kind} type="button" onClick={() => setKind(k.kind)}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors",
                  kind === k.kind ? "bg-bg-elev font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
                {k.plural}
                <span className={cn("tabular text-[10px]", n ? "text-fg-subtle" : "text-fg-subtle/50")}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2.5">
          <p className="mb-2 text-[11px] text-fg-subtle">{meta.blurb}</p>

          <AddRow
            placeholder={meta.placeholder}
            noun={meta.noun.toLowerCase()}
            onAdd={(name) => createRefAction(projectId, kind, name)}
            onDone={() => router.refresh()}
          />

          {items.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-fg-subtle">
              No {meta.plural.toLowerCase()} yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {items.map((r) => (
                <RefRow key={r.id} item={r} siblings={items} projectId={projectId}
                  onRun={run} pending={pending} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── everything else, folded away ── */}
      <button type="button" onClick={() => setShowMore((v) => !v)}
        className="inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg">
        <ChevronDown size={13} className={cn("transition-transform", showMore && "rotate-180")} />
        {showMore ? "Hide" : "More"} — starter lists, copy from another project, start again
      </button>

      {showMore && (
        <div className="space-y-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending}
              onClick={() => run(() => seedStarterListsAction(projectId))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-accent hover:text-accent disabled:opacity-60">
              <Sparkles size={13} /> Add the workbook&rsquo;s standard lists
            </button>
            <span className="text-[11px] text-fg-subtle">
              Who pays, whose float and designations only — the rest differ per job.
            </span>
          </div>

          {otherProjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <FluidSelect
                value={copyFrom} placeholder="Copy lists from…"
                options={otherProjects.map((p) => ({ value: String(p.id), label: p.name }))}
                onSelect={setCopyFrom} buttonClassName="h-8"
              />
              <button type="button" disabled={pending || !copyFrom}
                onClick={() => run(() => copyRefsFromAction(projectId, Number(copyFrom)))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-40">
                <Copy size={13} /> Copy
              </button>
              <span className="text-[11px] text-fg-subtle">Adds what is missing. Nothing is overwritten.</span>
            </div>
          )}

          <DangerZone projectId={projectId} counts={counts} totalRows={totalRows}
            onRun={run} pending={pending} />
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── add row ── */

function AddRow({
  placeholder, noun, onAdd, onDone,
}: {
  placeholder: string; noun: string;
  onAdd: (name: string) => Promise<Res>; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return;
    start(async () => {
      setErr(null);
      const res = await onAdd(name);
      if (!res.ok) { setErr(res.error ?? "Couldn't add."); return; }
      setName(""); onDone();
    });
  };

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={placeholder}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        <button type="button" onClick={submit} disabled={pending || !name.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg disabled:opacity-40">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
      </div>
      {err && <p className="mt-1 text-[11px] text-danger">{err}</p>}
      <p className="mt-1 text-[10px] text-fg-subtle">
        You can also add a {noun} straight from the dropdown while entering — you do not have to come here.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── a row ── */

function RefRow({
  item, siblings, projectId, onRun, pending,
}: {
  item: ProjectRef; siblings: ProjectRef[]; projectId: number;
  onRun: (fn: () => Promise<Res>) => void; pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [into, setInto] = useState("");

  if (editing) {
    return (
      <li className="flex items-center gap-1.5 py-1">
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onRun(() => renameRefAction(projectId, item.id, draft)); setEditing(false); }
            if (e.key === "Escape") { setEditing(false); setDraft(item.name); }
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-accent bg-bg px-2 text-[13px] outline-none" />
        <button type="button" onClick={() => { onRun(() => renameRefAction(projectId, item.id, draft)); setEditing(false); }}
          className="rounded bg-accent p-1 text-accent-fg"><Check size={12} /></button>
        <button type="button" onClick={() => { setEditing(false); setDraft(item.name); }}
          className="p-1 text-fg-subtle hover:text-fg"><X size={12} /></button>
      </li>
    );
  }

  if (merging) {
    const others = siblings.filter((s) => s.id !== item.id);
    return (
      <li className="flex flex-wrap items-center gap-1.5 py-1 text-[12px]">
        <span className="text-fg-muted">Move everything on <strong>{item.name}</strong> to</span>
        <FluidSelect value={into} placeholder="choose…" buttonClassName="h-7"
          options={others.map((o) => ({ value: String(o.id), label: o.name }))}
          onSelect={setInto} />
        <button type="button" disabled={!into}
          onClick={() => { onRun(() => mergeRefsAction(projectId, item.id, Number(into))); setMerging(false); }}
          className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accent-fg disabled:opacity-40">
          Merge
        </button>
        <button type="button" onClick={() => setMerging(false)} className="p-1 text-fg-subtle hover:text-fg">
          <X size={12} />
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 py-1">
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", !item.active && "text-fg-subtle line-through")}>
        {item.name}
      </span>
      {!item.active && <span className="shrink-0 text-[10px] text-fg-subtle">retired</span>}
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" title="Rename" onClick={() => setEditing(true)}
          className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"><Pencil size={12} /></button>
        {siblings.length > 1 && (
          <button type="button" title="Merge into another" onClick={() => setMerging(true)}
            className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"><GitMerge size={12} /></button>
        )}
        <button type="button" title="Delete (retired instead if it is in use)" disabled={pending}
          onClick={() => { if (confirm(`Delete “${item.name}”?`)) onRun(() => deleteRefAction(projectId, item.id)); }}
          className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"><Trash2 size={12} /></button>
      </span>
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────── danger ──── */

function DangerZone({
  projectId, counts, totalRows, onRun, pending,
}: {
  projectId: number; counts: Record<string, number>; totalRows: number;
  onRun: (fn: () => Promise<Res>) => void; pending: boolean;
}) {
  const [typed, setTyped] = useState("");
  const LABEL: Record<string, string> = {
    project_budget_lines: "budget lines", project_requisitions: "requisitions",
    project_payments: "payments", project_expenditures: "spending entries",
    project_payment_stages: "payment stages", project_site_people: "site people",
    project_site_days: "site days",
  };
  const what = totalRows === 0
    ? "nothing at the moment"
    : Object.entries(counts).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${LABEL[t] ?? t}`).join(", ");

  return (
    <div className="border-t border-border pt-3">
      <p className="text-[12px] font-medium text-danger">Start this project again</p>
      <p className="mb-2 mt-0.5 text-[11px] text-fg-muted">
        Deletes everything entered on this project — {what}. The project and the lists
        above are kept. This cannot be undone.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={typed} onChange={(e) => setTyped(e.target.value)}
          placeholder="type DISCARD to enable"
          className="h-8 w-52 rounded-md border border-border bg-bg px-2 text-[13px] outline-none focus:border-danger" />
        <button type="button" disabled={pending || typed !== "DISCARD" || totalRows === 0}
          onClick={() => { onRun(() => discardProjectDataAction(projectId)); setTyped(""); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-danger px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          Discard all entries
        </button>
      </div>
    </div>
  );
}
