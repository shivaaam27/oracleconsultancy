"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS — the list screen (Phase 1).
//
// The columns are NOT defined here. They come from ENTITY_VIEWS.project in
// lib/entity-view.ts, and `buildColumns` turns that metadata into the shell's
// props. That is the point of the ERPNext redesign: a record type gets its
// screen by being described, not by having one hand-built for it.
//
// Filters go through `useUrlFilters`, so they live in the address bar rather
// than in component state. A list filtered with `useState` has nothing for a
// saved view to save (CLAUDE.md's forward rule).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Loader2, X, Archive, DraftingCompass } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList, type RecordFilter } from "./record-list";
import { FluidSelect } from "./fluid-select";
import { MoneyInput } from "./money-input";
import { CURRENCIES, currencyLabel } from "@/lib/money-format";
import { SavedViewsBar, type SavedView } from "./saved-views-bar";
import { useUrlFilters } from "@/lib/use-url-filters";
import { useCreateParam } from "@/lib/use-create-param";
import { buildColumns } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { PROJECT_STATUSES, pct, fmtDate, scheduleTone } from "@/lib/projects-shared";
import { createProjectAction, archiveProjectAction } from "@/app/projects/actions";

const PROJECT_COLUMNS = ENTITY_VIEWS.project!.listColumns;

/** What the list needs from a project. A plain shape, so this file never has to
 *  import the server-only lib/projects.ts (see its header). */
export type ProjectRow = {
  id: number;
  name: string;
  variant: string | null;
  client: string | null;
  location: string | null;
  companyId: number;
  companyName: string | null;
  status: string;
  completionPct: string | number | null;
  startDate: string | null;
  daysRemaining: number | null;
  daysOverdue: number;
  expectedCompletion: string | null;
};

const TONE_CHIP: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  success: "bg-success-soft text-success",
  muted: "bg-bg-muted text-fg-muted",
};

export function ProjectsList({
  items, companies, savedViews = [],
}: {
  items: ProjectRow[];
  companies: Array<{ id: number; name: string }>;
  savedViews?: SavedView[];
}) {
  // /projects?new=1 — how the global New menu opens this page's own form.
  // The create is an inline form rather than a dialog, so this just unfolds it.
  const [adding, setAdding] = useState(false);
  /** The name of a project just saved, shown until the list carries it. */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  useCreateParam("1", () => setAdding(true));
  const { values: f, set: setFilter, dirty, query } = useUrlFilters(
    { company: "all", status: "all", q: "" },
    { debounceKeys: ["q"] },
  );

  const shown = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return items.filter((p) => {
      if (f.company !== "all" && String(p.companyId) !== f.company) return false;
      if (f.status !== "all" && p.status !== f.status) return false;
      if (needle) {
        const hay = [p.name, p.variant, p.client, p.location, p.companyName]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, f]);

  // Worst first — the overdue jobs at the top (DESIGN_SYSTEM.md §12). A project
  // with no dates yet cannot be ranked, so it sorts last rather than first.
  const ranked = useMemo(
    () => [...shown].sort((a, b) => {
      const av = a.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      const bv = b.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      return av - bv;
    }),
    [shown],
  );

  const rail: RecordFilter[] = useMemo(() => {
    const count = (fn: (p: ProjectRow) => boolean) => items.filter(fn).length;
    const href = (patch: Record<string, string>) => {
      const sp = new URLSearchParams();
      const next = { ...f, ...patch };
      for (const [k, v] of Object.entries(next)) {
        if (v && v !== "all" && v !== "") sp.set(k, v);
      }
      const qs = sp.toString();
      return qs ? `/projects?${qs}` : "/projects";
    };
    return [
      { key: "all", label: "All projects", group: "Status", count: items.length, href: href({ status: "all" }), active: f.status === "all" },
      ...PROJECT_STATUSES.map((s) => ({
        key: s, label: s, group: "Status",
        count: count((p) => p.status === s),
        href: href({ status: s }),
        active: f.status === s,
      })),
      {
        key: "overdue", label: "Overdue", group: "Attention",
        count: count((p) => p.daysOverdue > 0 && p.status !== "Completed" && p.status !== "Closed"),
        href: href({ status: "all" }), active: false, tone: "danger" as const,
      },
    ];
  }, [items, f]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={f.q}
          onChange={(e) => setFilter({ q: e.target.value })}
          placeholder="Search projects, clients, places…"
          className="h-8 min-w-[200px] flex-1 rounded-md border border-border bg-bg-elev px-2.5 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        <FluidSelect
          value={f.company}
          onSelect={(v: string) => setFilter({ company: v })}
          options={[{ value: "all", label: "All companies" },
            ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
        >
          <Plus size={14} /> New project
        </button>
      </div>

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={query}
        hasFilters={dirty}
        basePath="/projects"
        listKey="project"
      />

      {adding && (
        <NewProjectForm
          companies={companies}
          onDone={() => setAdding(false)}
          onAdding={setJustAdded}
        />
      )}

      {/* ⚠️ The row appears when the server re-renders the list, which is a few
          seconds after the save on this link. Saying so is the difference
          between "it is coming" and "it did not work". */}
      {justAdded && !ranked.some((p) => p.name.trim() === justAdded.trim()) && (
        <p className="flex items-center gap-1.5 text-sm text-fg-subtle">
          <Loader2 size={12} className="animate-spin" /> Adding {justAdded}…
        </p>
      )}

      <RecordList
        rows={ranked}
        rowKey={(p) => p.id}
        rowHref={(p) => `/projects/${p.id}`}
        listKey="project"
        filters={rail}
        total={items.length}
        shown={ranked.length}
        bulkActions={[{
          label: "Archive", tone: "danger", icon: <Archive size={12} />,
          run: async (picked) => { for (const p of picked) await archiveProjectAction(p.id); },
        }]}
        empty={
          <div className="py-6 text-center">
            <DraftingCompass size={20} className="mx-auto mb-2 text-fg-subtle" />
            <p className="text-base font-medium">No projects yet</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Add one with “New project”. Nothing is filled in for you — every figure is typed.
            </p>
          </div>
        }
        columns={buildColumns<ProjectRow & Record<string, unknown>>(PROJECT_COLUMNS, {
          overrides: {
            // Two lines: the job, then the context that identifies it. The same
            // shape the tasks and commitments lists use.
            name: (p) => (
              <span className="min-w-0">
                <span className="block truncate text-base font-medium">{p.name}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {[p.variant, p.location, p.companyName].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            ),
            completionPct: (p) => {
              const v = p.completionPct === null ? null : Number(p.completionPct);
              return (
                <span className="tabular text-sm">
                  {v === null || !Number.isFinite(v) ? "—" : pct(v, 0)}
                </span>
              );
            },
            // The programme in one cell: the number, and what it means.
            daysRemaining: (p) => {
              const tone = scheduleTone(
                { daysRemaining: p.daysRemaining, daysOverdue: p.daysOverdue,
                  expectedCompletion: null, daysElapsed: null, timeElapsedPct: null },
                p.status,
              );
              if (p.daysRemaining === null) {
                return <span className="text-sm text-fg-subtle" title="No start date or duration set yet">—</span>;
              }
              return (
                <span
                  className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium tabular", TONE_CHIP[tone])}
                  title={p.expectedCompletion ? `Expected ${fmtDate(p.expectedCompletion)}` : undefined}
                >
                  {p.daysOverdue > 0 ? `${p.daysOverdue} over` : `${p.daysRemaining}`}
                </span>
              );
            },
          },
        })}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── new project ─── */

/**
 * Raising a project.
 *
 * ⚠️ NOTHING IS PRE-FILLED. Every box starts empty and stays empty until it is
 * typed into — that was the instruction and it is also the right design: a
 * default the owner did not choose is indistinguishable, later, from a figure
 * they did. The only two values that arrive with anything in them are the tax
 * rates, and they are shown as editable fields carrying the standard Tanzanian
 * rates, not hidden inside a formula the way the workbook hides `1.18`.
 *
 * Only the company and the name are required. A project is usually raised the
 * day it is won, when the PO number and programme are not yet known.
 */
function NewProjectForm({
  companies, onDone, onAdding,
}: {
  companies: Array<{ id: number; name: string }>;
  onDone: () => void;
  /** Handed the name that was just saved, so the list can say it is coming. */
  onAdding: (name: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // ⚠️ `revalidatePath` in the server action clears the SERVER cache; it does not
  // make an already-open client route re-fetch. Without this the new project
  // saved fine and the list still read "No projects yet" until a manual reload —
  // which looks exactly like a failed save.
  const router = useRouter();
  // FluidSelect is presentational and carries no form `name`, so the chosen id
  // is held here and submitted through a hidden input. Native <select> is
  // forbidden by the design system (CLAUDE.md) — its popup mis-renders.
  const [companyId, setCompanyId] = useState("");
  // Every amount on the project is shown in this. TZS because the workbook is,
  // and because every job so far has been in shillings.
  const [currency, setCurrency] = useState("TZS");
  const [quotationValue, setQuotationValue] = useState("");
  const [poValue, setPoValue] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <form
      ref={formRef}
      className="rounded-lg border border-border bg-bg-elev p-3"
      action={(fd) => {
        setError(null);
        if (!companyId) {
          setError("Choose which company is doing the work.");
          // The form is taller than the window, so an error at the foot of it is
          // invisible when the offending field is at the top. Go to the message.
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        start(async () => {
          const res = await createProjectAction({
            companyId: Number(fd.get("companyId")),
            name: String(fd.get("name") ?? ""),
            variant: String(fd.get("variant") ?? ""),
            client: String(fd.get("client") ?? ""),
            location: String(fd.get("location") ?? ""),
            poNumber: String(fd.get("poNumber") ?? ""),
            startDate: String(fd.get("startDate") ?? ""),
            durationDays: fd.get("durationDays") ? Number(fd.get("durationDays")) : null,
            quotationValue,
            poValue,
            currency,
            vatRate: String(fd.get("vatRate") ?? ""),
            whtRate: String(fd.get("whtRate") ?? ""),
          });
          if (!res.ok) setError(res.error ?? "Couldn't save.");
          // ⚠️ onDone() LAST and outside nothing: the form closes, then the
          // list re-renders from the server a few seconds later. The caller
          // shows "Adding the project…" in between, or the empty list reads as
          // a failed save.
          else {
            onAdding(String(fd.get("name") ?? "").trim());
            setCompanyId(""); setQuotationValue(""); setPoValue("");
            onDone(); router.refresh();
          }
        });
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-medium">New project</h3>
        <button type="button" onClick={onDone} className="text-fg-subtle hover:text-fg"><X size={15} /></button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Company" required>
          <input type="hidden" name="companyId" value={companyId} />
          {/* aria-label: FluidSelect renders a bare button, so without this a
              screen reader announces only "button". */}
          <FluidSelect
            value={companyId}
            placeholder="Choose…"
            className="w-full"
            buttonClassName="h-8 w-full justify-between"
            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
            onSelect={setCompanyId}
          />
        </Field>
        <Field label="Project name" required><Input name="name" required placeholder="e.g. Patamela Villa" /></Field>
        <Field label="Build type"><Input name="variant" placeholder="e.g. Duplex house" /></Field>
        <Field label="Client"><Input name="client" /></Field>
        <Field label="Location"><Input name="location" /></Field>
        <Field label="PO number"><Input name="poNumber" /></Field>
        <Field label="Start date"><Input name="startDate" type="date" /></Field>
        <Field label="Duration (days)" hint="The workbook's “4 months” is 120 days.">
          <Input name="durationDays" type="number" min="1" />
        </Field>
        <Field label="Currency" hint="Every amount on this project shows in it.">
          <FluidSelect
            value={currency}
            options={CURRENCIES.map((c) => ({ value: c.code, label: currencyLabel(c.code) }))}
            onSelect={setCurrency}
            buttonClassName="h-8 w-full justify-between"
            className="w-full"
          />
        </Field>
        <Field label="Quotation value" hint="Your price, BEFORE VAT is added.">
          <MoneyInput value={quotationValue} onChange={setQuotationValue} currency={currency} />
        </Field>
        <Field label="PO value" hint="The client's order total, VAT already inside it.">
          <MoneyInput value={poValue} onChange={setPoValue} currency={currency} />
        </Field>
        <Field label="VAT rate" hint="Type 18 for 18%. Set 0 if zero-rated.">
          <Input name="vatRate" inputMode="decimal" placeholder="18" />
        </Field>
        <Field label="Withholding tax rate" hint="Type 10 for 10%.">
          <Input name="whtRate" inputMode="decimal" placeholder="10" />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending && <Loader2 size={13} className="animate-spin" />} Save project
        </button>
        <span className="text-xs text-fg-subtle">
          Only the company and name are needed now — the rest can be filled in later.
        </span>
      </div>
    </form>
  );
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs uppercase tracking-[0.04em] text-fg-subtle">
        {label}{required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-fg-subtle">{hint}</span>}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-8 w-full rounded-md border border-border bg-bg px-2 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
    />
  );
}
