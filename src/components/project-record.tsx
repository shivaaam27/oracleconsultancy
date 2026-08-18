"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT — the record screen (Phase 1).
//
// The workbook's SNAPSHOT page, rebuilt on the standard record shell. Three
// things are different from the spreadsheet, all of them deliberate:
//
//   1. A TYPED FIGURE AND A WORKED-OUT ONE LOOK DIFFERENT. In the workbook they
//      are all just cells in column B. Here every derived figure carries a small
//      "=" marker and names the cell it replaces, so you can always tell what
//      the system worked out from what somebody entered.
//
//   2. WHAT IS NOT KNOWN SAYS SO. The workbook shows 0 or #N/A. This shows "—"
//      and names the phase that will supply it. A zero that means "we have not
//      built that yet" is the most dangerous number on a dashboard.
//
//   3. THE CORRECTIONS ARE ON THE PAGE. Old figure beside new figure, with the
//      spreadsheet's own formula, for every change Phase 1 makes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Check, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordPage, type RecordSection } from "./record-page";
import { FluidSelect } from "./fluid-select";
import { ProjectTabs } from "./project-tabs";
import { ProjectEditPanel } from "./project-edit-panel";
import {
  money, pct, fmtDate, scheduleTone, isOpen, contractCorrections, num,
  PROJECT_STATUSES, type Contract, type ProjectInput,
} from "@/lib/projects-shared";
import { updateProjectAction } from "@/app/projects/actions";

type Stored = ProjectInput & {
  id: number;
  mealRate: string | null;
  currency: string;
  name: string;
  variant: string | null;
  client: string | null;
  location: string | null;
  companyName: string | null;
  poNumber: string | null;
  status: string;
  notes: string | null;
  archived: boolean;
};

type ProgrammeView = {
  expectedCompletion: string | null;
  daysElapsed: number | null;
  daysRemaining: number | null;
  daysOverdue: number;
  timeElapsedPct: number | null;
};

const TONE_CHIP: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  success: "bg-success-soft text-success",
  muted: "bg-bg-muted text-fg-muted",
};

/** A figure the system worked out. The marker is the whole point of it. */
function Derived({ value, from, title }: { value: string | null; from: string; title?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5" title={title ?? `Worked out, not typed. Replaces ${from} in the workbook.`}>
      <span className="tabular">{value ?? <Missing />}</span>
      <span className="rounded-sm bg-bg-muted px-1 font-mono text-[9px] leading-[14px] text-fg-subtle">=</span>
    </span>
  );
}

/** Not known — as distinct from zero. */
function Missing({ note }: { note?: string }) {
  return (
    <span className="text-fg-subtle" title={note ?? "Not entered yet"}>
      —{note && <span className="ml-1.5 text-[11px]">{note}</span>}
    </span>
  );
}

export function ProjectRecord({
  project: p, programme: pr, contract: c,
}: {
  project: Stored;
  programme: ProgrammeView;
  contract: Contract;
}) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const tone = scheduleTone(
    { ...pr, expectedCompletion: null },
    p.status,
  );
  const completion = num(p.completionPct);
  const corrections = contractCorrections(p);

  const setStatus = (status: string) =>
    start(async () => {
      await updateProjectAction(p.id, { status });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });

  /* ── the sections ──────────────────────────────────────────────────────── */

  const sections: RecordSection[] = [
    {
      id: "identity",
      title: "Project",
      fields: [
        { label: "Client", value: p.client ?? <Missing /> },
        { label: "Location", value: p.location ?? <Missing /> },
        { label: "Build type", value: p.variant ?? <Missing /> },
        { label: "Company", value: p.companyName ?? <Missing /> },
        { label: "PO number", value: p.poNumber ? <span className="font-mono text-[12px]">{p.poNumber}</span> : <Missing /> },
      ],
    },
    {
      id: "programme",
      title: "Programme",
      body: (
        <p className="text-[11px] text-fg-subtle">
          Only the start date and the duration are stored. Everything else here is
          worked out from them, so it can never disagree with them — SNAPSHOT B9–B13.
        </p>
      ),
      fields: [
        { label: "Start date", value: fmtDate(p.startDate as string | null) ?? <Missing /> },
        { label: "Duration", value: p.durationDays !== null ? `${p.durationDays} days` : <Missing /> },
        {
          label: "Expected completion",
          value: <Derived value={fmtDate(pr.expectedCompletion)} from="B11 (=B9+B10)" />,
        },
        {
          label: "Days in progress",
          value: <Derived value={pr.daysElapsed !== null ? String(pr.daysElapsed) : null} from="B12 (=TODAY()-B9)" />,
        },
        {
          label: "Days remaining",
          value:
            pr.daysRemaining === null ? <Missing /> : (
              <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[12px] font-medium tabular", TONE_CHIP[tone])}>
                {pr.daysOverdue > 0 ? `${pr.daysOverdue} days overdue` : `${pr.daysRemaining} days`}
              </span>
            ),
        },
        {
          label: "Work completed",
          value: completion === null ? <Missing /> : <span className="tabular">{pct(completion, 0)}</span>,
        },
        {
          // The comparison the workbook never makes: time spent against work done.
          label: "Time against work",
          full: true,
          value: <TimeVsWork timeElapsedPct={pr.timeElapsedPct} completion={completion} />,
        },
      ],
    },
    {
      id: "contract",
      title: "Contract",
      fields: [
        { label: "Quotation (excl. VAT)", value: money(num(p.quotationValue)) ?? <Missing />, },
        { label: "PO value (incl. VAT)", value: money(num(p.poValue)) ?? <Missing /> },
        { label: "Additional work (incl. VAT)", value: money(num(p.additionalWork)) ?? <Missing note="none agreed" /> },
        { label: "Total contract", value: <Derived value={money(c.totalContract)} from="C50 (=C48+C49)" /> },
        { label: "VAT rate", value: pct(num(p.vatRate), 0) ?? <Missing /> },
        { label: "Withholding tax rate", value: pct(num(p.whtRate), 0) ?? <Missing /> },
        { label: "Meal rate per day", value: money(num(p.mealRate)) ?? <Missing note="needed by the Site sheet" /> },
        {
          label: "VAT within the total",
          value: <Derived value={money(c.vatPortion)} from="nothing — the workbook never shows this" />,
        },
        {
          label: "Contract excl. VAT",
          value: <Derived value={money(c.contractExVat)} from="the /1.18 inside C47" />,
        },
        {
          label: "Withholding tax",
          value: <Derived value={money(c.withholdingTax)} from="C47 (=(C46/1.18)*10%)" />,
        },
      ],
    },
    {
      id: "profit",
      title: "Profit",
      body: <AwaitingBudget contract={c} projectId={p.id} />,
      fields: [
        { label: "Budgeted profit", value: c.budgetedProfit === null ? <Missing note="needs the budget" /> : <Derived value={money(c.budgetedProfit)} from="B16 (=B14-B15)" /> },
        { label: "Projected margin", value: c.projectedMargin === null ? <Missing note="needs the budget" /> : <Derived value={pct(c.projectedMargin)} from="B17 (=B16/B14)" /> },
        { label: "Profit after withholding tax", value: c.profitAfterWht === null ? <Missing note="needs the budget" /> : <Derived value={money(c.profitAfterWht)} from="B19 (=B16-B18)" /> },
        { label: "Margin after withholding tax", value: c.marginAfterWht === null ? <Missing note="needs the budget" /> : <Derived value={pct(c.marginAfterWht)} from="B20 (=B19/B14)" /> },
      ],
    },
    {
      id: "corrections",
      title: "Changed from the spreadsheet",
      collapsible: true,
      defaultOpen: true,
      body: <Corrections rows={corrections} />,
    },
  ];

  if (p.notes) {
    sections.splice(1, 0, { id: "notes", title: "Notes", fields: [{ label: "", value: p.notes, full: true }] });
  }

  return (
    <div className="space-y-3">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted hover:text-fg">
        <ArrowLeft size={13} /> Projects
      </Link>

      <ProjectTabs projectId={p.id} active="overview" />

      <RecordPage
        title={p.name}
        subtitle={[p.variant, p.client, p.location].filter(Boolean).join(" · ") || undefined}
        code={p.poNumber ?? undefined}
        // No status chip here: the dropdown on the right IS the status, and
        // showing "Active" twice on one header line reads as a bug. What the
        // chip adds instead is the thing the word cannot say — whether the job
        // is on time.
        status={
          pr.daysRemaining === null ? undefined : (
            <span className={cn("inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-medium", TONE_CHIP[tone])}>
              {pr.daysOverdue > 0 ? `${pr.daysOverdue} days overdue` : `${pr.daysRemaining} days left`}
            </span>
          )
        }
        actions={
          <div className="flex items-center gap-2">
            {pending && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
            {saved && <Check size={13} className="text-success" />}
            <ProjectEditPanel
              project={{
                id: p.id, name: p.name, variant: p.variant, client: p.client,
                location: p.location, poNumber: p.poNumber,
                startDate: typeof p.startDate === "string" ? p.startDate : null,
                durationDays: p.durationDays,
                quotationValue: p.quotationValue as string | null,
                poValue: p.poValue as string | null,
                additionalWork: p.additionalWork as string | null,
                vatRate: p.vatRate as string | null,
                whtRate: p.whtRate as string | null,
                completionPct: p.completionPct as string | null,
                mealRate: p.mealRate, currency: p.currency, notes: p.notes,
              }}
            />
            <FluidSelect
              value={p.status}
              align="right"
              buttonClassName="h-7"
              options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
              onSelect={setStatus}
            />
          </div>
        }
        sections={sections}
        sidebar={<NextPhases />}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────── small components ─── */

/**
 * Time used against work done.
 *
 * Both numbers exist in the workbook (B12/B10 and B36) but never side by side,
 * so the question they answer together — "are we actually behind?" — is never
 * put. Two bars make it a glance.
 */
function TimeVsWork({ timeElapsedPct, completion }: { timeElapsedPct: number | null; completion: number | null }) {
  if (timeElapsedPct === null && completion === null) return <Missing />;
  const behind = timeElapsedPct !== null && completion !== null && timeElapsedPct > completion + 0.05;
  const Bar = ({ label, v, tone }: { label: string; v: number | null; tone: string }) => (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-fg-subtle">{label}</span>
        <span className="tabular text-[11px]">{v === null ? "—" : pct(v, 0)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-bg-muted">
        <div className={cn("h-full", tone)} style={{ width: `${Math.min(100, Math.max(0, (v ?? 0) * 100))}%` }} />
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
      <Bar label="Time used" v={timeElapsedPct} tone={behind ? "bg-danger" : "bg-fg-subtle"} />
      <Bar label="Work completed" v={completion} tone="bg-accent" />
      {behind && (
        <p className="flex items-start gap-1.5 text-[11px] text-danger">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          More of the time has gone than the work — the job is behind its programme.
        </p>
      )}
    </div>
  );
}

/** Says plainly that the profit figures are waiting on Phase 2. */
function AwaitingBudget({ contract: c, projectId }: { contract: Contract; projectId: number }) {
  if (c.budgetedProfit !== null) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-bg-subtle px-2.5 py-2 text-[11px] text-fg-muted">
      <Info size={12} className="mt-px shrink-0" />
      <span>
        Profit is the quotation minus the <strong>budget</strong>, and this project has no
        budget lines yet. Add them on the{" "}
        <Link href={`/projects/${projectId}/budget`} className="text-accent underline underline-offset-2">
          Budget tab
        </Link>{" "}
        and these figures fill in by themselves. They stay blank rather than showing a
        zero, which would read as a 100% margin.
      </span>
    </p>
  );
}

/** Old figure beside new figure, for every change Phase 1 makes. */
function Corrections({ rows }: { rows: ReturnType<typeof contractCorrections> }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-fg-subtle">
        Every figure Phase 1 calculates differently from the spreadsheet, with the
        spreadsheet&rsquo;s own formula. Where both agree, nothing has moved.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12px]">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-[0.04em] text-fg-subtle">
              <th className="py-1.5 pr-3 text-left font-medium">Figure</th>
              <th className="py-1.5 pr-3 text-right font-medium">Spreadsheet</th>
              <th className="py-1.5 pr-3 text-right font-medium">Corrected</th>
              <th className="py-1.5 text-left font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/60 align-top">
                <td className="py-2 pr-3">
                  <span className="block font-medium">{r.label}</span>
                  <span className="block font-mono text-[10px] text-fg-subtle">{r.excelFormula}</span>
                </td>
                <td className="py-2 pr-3 text-right tabular">{money(r.excel) ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular">
                  <span className={cn(!r.same && "font-medium text-accent")}>{money(r.corrected) ?? "—"}</span>
                  <span className={cn("ml-1.5 rounded-sm px-1 text-[9px]", r.same ? "bg-success-soft text-success" : "bg-warn-soft text-warn")}>
                    {r.same ? "same" : "differs"}
                  </span>
                </td>
                <td className="py-2 text-[11px] text-fg-muted">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** What this record will grow into, so the gaps are stated rather than felt. */
function NextPhases() {
  const phases: Array<{ n: number; title: string; what: string; done?: boolean }> = [
    { n: 1, title: "Project record", what: "This page — header, programme, contract, tax.", done: true },
    { n: 2, title: "Budget", what: "The bill of quantities: item codes, categories, priced lines.", done: true },
    { n: 3, title: "Requisitions", what: "Site requests, head-office approval, goods received." },
    { n: 4, title: "Payments & spend", what: "The three cash routes and the running float." },
    { n: 5, title: "Snapshot", what: "The dashboard: category gauges and the payment plan." },
    { n: 6, title: "Meals & labour", what: "The daily site tick-sheets." },
  ];
  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">Build phases</h3>
      <ol className="space-y-2">
        {phases.map((ph) => (
          <li key={ph.n} className="flex gap-2">
            <span className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-medium",
              ph.done ? "bg-success-soft text-success" : "bg-bg-muted text-fg-subtle",
            )}>
              {ph.done ? <Check size={10} /> : ph.n}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[12px]", ph.done ? "font-medium" : "text-fg-muted")}>{ph.title}</span>
              <span className="block text-[11px] text-fg-subtle">{ph.what}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
