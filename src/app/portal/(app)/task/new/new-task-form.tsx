"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ClipboardCheck, Loader2, CheckCircle2, AlertTriangle, Star,
} from "lucide-react";
import { Hero, Panel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { DirectorTaskForm } from "@/components/director-task-form";
import { PeoplePicker } from "@/components/people-picker";
import { CompanyMultiSelect } from "@/components/company-multi-select";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { portalBulkCreateTasks, type PortalBulkFailure } from "@/app/portal/bulk-task-actions";

type Person = { id: number; name: string; companyId?: number | null; companyIds?: number[] };
type Company = { id: number; name: string };

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_OPTIONS: FluidOption[] = PRIORITIES.map((p) => ({ value: p, label: p }));
const inputCls = "bare-field w-full rounded-xl ring-1 ring-border px-3.5 py-3 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40 caret-accent";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
const selectBtn = "bare-field flex w-full items-center justify-between rounded-xl ring-1 ring-border px-3.5 py-3 text-sm";

/** Companies a person belongs to — primary plus any extra links. */
function personCompanyIds(p: Person): number[] {
  if (p.companyIds && p.companyIds.length) return p.companyIds;
  return p.companyId != null ? [p.companyId] : [];
}

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "eng", "chef", "capt", "sir", "madam", "mx", "rev", "hon"]);
function nameParts(name: string): string[] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1 && HONORIFICS.has(parts[0].replace(/\.$/, "").toLowerCase())) return parts.slice(1);
  return parts;
}
function firstName(name: string): string {
  return nameParts(name)[0] || name;
}
function initials(name: string): string {
  const parts = nameParts(name);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function NewTaskForm({
  me,
  people,
  companies,
  isDirector = false,
}: {
  me: { id: number; name: string };
  people: Person[];
  companies: Company[];
  isDirector?: boolean;
}) {
  // The pill "New task" page renders the SAME composer as the board and the
  // Tasks page — auto-opened. Directors assign group-wide (multi-company
  // fan-out + "Only I can close it"); managers assign to their team. Closing
  // the sheet returns to where they came from.
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [bulk, setBulk] = useState(false);
  const backHref = isDirector ? "/portal/board" : "/portal";

  const peopleForComposer = people.map((p) => ({
    id: p.id,
    name: p.name,
    companyId: p.companyId ?? null,
    companyIds: p.companyIds,
  }));

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) router.push(backHref);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors">
        <ArrowLeft size={15} /> {isDirector ? "Board" : "My tasks"}
      </Link>

      <Reveal delay={0}>
        <Hero
          title="New task"
          subtitle={isDirector ? "Assign work to anyone, in any company." : "Delegate work to yourself or your team."}
        />
      </Reveal>

      {/* One task / Paste multiple — segmented control. */}
      <Reveal delay={0.04}>
        <div className="inline-flex w-fit rounded-full bg-bg-subtle p-1 ring-1 ring-border">
          <button
            type="button"
            onClick={() => setBulk(false)}
            aria-pressed={!bulk}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !bulk ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            One task
          </button>
          <button
            type="button"
            onClick={() => setBulk(true)}
            aria-pressed={bulk}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              bulk ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            Paste multiple
          </button>
        </div>
      </Reveal>

      {bulk ? (
        <Reveal delay={0.08}>
          <BulkTaskPanel
            me={me}
            people={peopleForComposer}
            companies={companies}
            isDirector={isDirector}
          />
        </Reveal>
      ) : (
        <>
          <Reveal delay={0.05}>
            <Panel glass className="flex flex-col items-start gap-3 p-4 sm:p-5">
              <p className="text-sm text-fg-muted">Fill in the task and assign it. The form opens automatically — reopen it below if you closed it.</p>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
              >
                <ClipboardCheck size={15} /> New task
              </button>
            </Panel>
          </Reveal>

          <DirectorTaskForm
            people={peopleForComposer}
            companies={companies}
            role={isDirector ? "director" : "manager"}
            open={open}
            onOpenChange={onOpenChange}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Paste-multiple bulk composer. One task per line in the textarea; the
 * company / lead / working / priority / deadline / instruction controls
 * apply to ALL pasted lines. Posts to portalBulkCreateTasks (which
 * re-verifies the role's scope server-side).
 *
 * Directors may pick several companies (a task is created per company per
 * line); managers/HR keep one company.
 * ------------------------------------------------------------------ */
function BulkTaskPanel({
  me, people, companies, isDirector,
}: {
  me: { id: number; name: string };
  people: Person[];
  companies: Company[];
  isDirector: boolean;
}) {
  const { toast } = useToast();
  const [titlesText, setTitlesText] = useState("");
  const [companyIds, setCompanyIds] = useState<number[]>(
    !isDirector && companies.length === 1 ? [companies[0].id] : []
  );
  const [responsibleIds, setResponsibleIds] = useState<number[]>([]);
  const [leadIds, setLeadIds] = useState<number[]>([]);
  const [priority, setPriority] = useState("Medium");
  const [deadline, setDeadline] = useState("");
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ created: number; failures: PortalBulkFailure[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the lead set valid as responsible people change (mirror the single form).
  useEffect(() => {
    setLeadIds((cur) => {
      const kept = cur.filter((id) => responsibleIds.includes(id));
      if (kept.length === 0 && responsibleIds.length > 0) return [responsibleIds[0]];
      return kept.length === cur.length ? cur : kept;
    });
  }, [responsibleIds]);

  // People are scoped to the SELECTED companies for every role (pick a company →
  // only its people show); full list before any company is chosen.
  const peopleForPicker = useMemo(() => {
    if (companyIds.length === 0) return people;
    const scoped = people.filter((p) => personCompanyIds(p).some((cid) => companyIds.includes(cid)));
    return scoped.length ? scoped : people;
  }, [people, companyIds]);

  const workingIds = useMemo(
    () => responsibleIds.filter((id) => !leadIds.includes(id)),
    [responsibleIds, leadIds],
  );

  const selectedPeople = useMemo(() => {
    const byId = new Map(peopleForPicker.map((p) => [p.id, p]));
    return responsibleIds.map((id) => byId.get(id)).filter((p): p is Person => !!p);
  }, [peopleForPicker, responsibleIds]);

  const lines = useMemo(
    () => titlesText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [titlesText],
  );

  const canSubmit =
    lines.length > 0 && responsibleIds.length > 0 && leadIds.length > 0 && companyIds.length > 0;

  function toggleLead(id: number) {
    setLeadIds((cur) => {
      if (cur.includes(id)) {
        const next = cur.filter((x) => x !== id);
        if (next.length === 0) {
          const fallback = responsibleIds.find((x) => x !== id);
          return fallback != null ? [fallback] : cur;
        }
        return next;
      }
      return [...cur, id];
    });
  }

  function resetAll() {
    setTitlesText("");
    setResponsibleIds([]);
    setLeadIds([]);
    setInstruction("");
    setDeadline("");
    setPriority("Medium");
    setResult(null);
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!canSubmit) {
      setError("Add at least one task line, a company and a responsible person.");
      return;
    }
    setPending(true);
    try {
      const res = await portalBulkCreateTasks({
        titles: lines,
        // Directors + managers fan out across all picked companies; scope is
        // re-verified server-side (HR is narrowed to a single company there).
        companyIds,
        leadIds,
        workingIds,
        priority,
        deadline: deadline || null,
        instruction: instruction.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({ created: res.created, failures: res.failures });
      toast(
        res.created === 1 ? "1 task created" : `${res.created} tasks created`,
        { tone: res.failures.length ? "warn" : "success" },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <Panel glass className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
            <CheckCircle2 size={22} />
          </span>
          <div>
            <p className="text-sm font-medium">
              {result.created === 1 ? "1 task created" : `${result.created} tasks created`}
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {result.failures.length === 0
                ? "All your pasted lines were added."
                : `${result.failures.length} line${result.failures.length === 1 ? "" : "s"} couldn't be added.`}
            </p>
          </div>
        </div>

        {result.failures.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-danger-soft/40 p-3 ring-1 ring-danger/20">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-danger">
              <AlertTriangle size={13} /> Not added
            </p>
            <ul className="flex flex-col gap-1">
              {result.failures.map((f, i) => (
                <li key={i} className="text-xs text-fg-muted">
                  <span className="text-fg">{f.title || "(blank)"}</span> — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
          >
            <ClipboardCheck size={15} /> Add more
          </button>
          <Link
            href={isDirector ? "/portal/board" : "/portal/tasks"}
            className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-4 py-2 text-sm font-medium text-fg ring-1 ring-border transition-transform active:scale-95"
          >
            View tasks
          </Link>
        </div>
      </Panel>
    );
  }

  // ── Compose screen ──────────────────────────────────────────────────────────
  return (
    <Panel glass className="flex flex-col gap-3.5 p-4 sm:p-5">
      <div>
        <label className={fieldLabel}>Tasks — one per line</label>
        <textarea
          value={titlesText}
          onChange={(e) => setTitlesText(e.target.value)}
          rows={6}
          placeholder={"Renew the business licence\nChase Gofiber about the printer\nPrepare the board pack"}
          className={inputCls}
        />
        <p className="mt-1.5 text-[11px] text-fg-muted">
          One task per line. {lines.length > 0 && `${lines.length} task${lines.length === 1 ? "" : "s"} ready.`}
        </p>
      </div>

      <div>
        <label className={fieldLabel}>{companyIds.length > 1 ? "Companies" : "Company"}</label>
        {companies.length > 1 ? (
          <CompanyMultiSelect companies={companies} value={companyIds} onChange={setCompanyIds} />
        ) : (
          <p className="rounded-xl bg-bg-subtle/60 px-3.5 py-3 text-sm text-fg ring-1 ring-border">{companies[0]?.name ?? "Your company"}</p>
        )}
        {companyIds.length > 1 && lines.length > 0 && (
          <p className="mt-1.5 text-[11px] text-accent">Creates {companyIds.length * lines.length} tasks — one per company, per line</p>
        )}
      </div>

      <div>
        <label className={fieldLabel}>Responsible people</label>
        <PeoplePicker
          people={peopleForPicker}
          value={responsibleIds}
          onChange={setResponsibleIds}
          emptyLabel="Choose who's on it…"
        />
      </div>

      {selectedPeople.length > 0 && (
        <div>
          <label className={fieldLabel}>Who's the lead?</label>
          <div className="flex flex-wrap gap-1.5">
            {selectedPeople.map((p) => {
              const lead = leadIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleLead(p.id)}
                  aria-pressed={lead}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors ${
                    lead
                      ? "bg-accent-soft text-accent ring-accent/30"
                      : "bg-bg-subtle text-fg-muted ring-border hover:ring-accent/40"
                  }`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-medium ${lead ? "bg-accent text-accent-fg" : "bg-bg-muted text-fg-muted"}`}>
                    {initials(p.name)}
                  </span>
                  {firstName(p.name)}
                  <Star size={12} className={lead ? "fill-accent text-accent" : "text-fg-muted"} />
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-fg-muted">Tap a star to set the lead. At least one is required. They apply to every line.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Priority</label>
          <FluidSelect value={priority} options={PRIORITY_OPTIONS} onSelect={setPriority} buttonClassName={selectBtn} />
        </div>
        <div>
          <label className={fieldLabel}>Deadline</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={fieldLabel}>Instruction (optional)</label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          placeholder="Becomes the pinned brief on every task"
          className={inputCls}
        />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !canSubmit}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}{" "}
        {lines.length > 1 ? `Create ${lines.length} tasks` : "Create task"}
      </button>
    </Panel>
  );
}
