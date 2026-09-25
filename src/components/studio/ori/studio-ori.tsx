"use client";

/**
 * ORI Automation in Studio (design/studio-mockup, boards Ori + OriBuilder).
 *
 *   header  "ORI Automation" · New automation
 *   cards   ORI is watching (how many are live, when things last fired)  |
 *           Quick recipes (one tap opens the builder filled in)
 *   below   the rules — Live or Paused — each with Test now, its on/off switch
 *           and Cancel, and a click opens its past firings  |  the three
 *           built-in signals, with their switches and thresholds
 *
 * "New automation" or a recipe swaps the page for the builder (builder.tsx).
 *
 * ⚠️ RESTYLED, NOT REWIRED: the same actions as the old page —
 * toggleAutomationActive, cancelAutomation (soft: the rule is switched off and
 * kept), testAutomationAction (fires ONLY that rule, through the cron's own
 * path) and ruleFiringsAction.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Trash2, Loader2, Sparkles, Command, ChevronDown, ChevronRight } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber, stBtn } from "@/components/studio/kit";
import { RowMenu, MenuItem, MenuLine } from "@/components/studio/assets/bits";
import { StudioSheet } from "@/components/studio/sheet";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import type { DescribedRule } from "@/app/ori-automations/describe";
import { toggleAutomationActive, cancelAutomation, testAutomationAction, ruleFiringsAction } from "@/app/ori-automations/actions";
import { OriBuilder, RECIPES, draftFor, type Draft } from "./builder";
import { OriSignals, type SignalSettings, type SignalLastFired } from "./signals";
import { OriToggle } from "./toggle";
import { kindIcon, relTime } from "./kinds";

type NamedRow = { id: number; name: string };

/** How many recipes a phone shows on the card; the rest are one tap away. */
const PHONE_RECIPES = 6;
const recipeChip = "flex h-7 items-center whitespace-nowrap rounded-lg border border-[#34363B] bg-[rgba(20,21,23,0.85)] px-2.5 text-xs text-[#E6E6E3] transition-colors hover:border-[#55585E] hover:text-white";

export type StudioOriData = {
  rules: DescribedRule[];
  people: NamedRow[];
  companies: NamedRow[];
  signals: SignalSettings;
  /** Relative words, worked out on the server. */
  signalsFired: SignalLastFired;
  /** The rule that fired most recently, for the watching card. */
  latest: { when: string; what: string } | null;
};

export function StudioOri({ data }: { data: StudioOriData }) {
  const { rules, people, companies, signals, signalsFired, latest } = data;
  const [building, setBuilding] = useState<{ key: number; draft: Draft; from: string | null } | null>(null);
  const [view, setView] = useState<"live" | "paused">("live");
  const [allRecipes, setAllRecipes] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useFitFrame(bottom, { enabled: !building, minimum: 420, deps: [building == null] });

  const live = rules.filter((r) => r.active);
  const paused = rules.filter((r) => !r.active);
  const shown = view === "live" ? live : paused;
  const signalsOn = [signals.quietStaffEnabled, signals.decisionReminderEnabled, signals.healthDigestEnabled].filter(Boolean).length;

  function build(recipe: { label: string; draft: Partial<Draft> } | null) {
    setAllRecipes(false);
    setBuilding({ key: Date.now(), draft: draftFor(recipe?.draft ?? null), from: recipe?.label ?? null });
    window.scrollTo({ top: 0 });
  }

  if (building) {
    return (
      <StudioScope>
        <OriBuilder key={building.key} initial={building.draft} from={building.from} people={people} companies={companies} onClose={() => setBuilding(null)} />
      </StudioScope>
    );
  }

  return (
    <StudioScope className="space-y-5">
      <StudioHeader
        title="ORI Automation"
        right={<button type="button" onClick={() => build(null)} className={stBtn.dark}><Plus size={14} />New automation</button>}
      />

      <StudioCardRow>
        <StudioCard className="min-h-[200px] lg:h-[220px]">
          <CardHead label="ORI is watching" right={<span className="max-sm:hidden">paused automations never fire</span>} />
          <div className="flex flex-1 flex-wrap items-end gap-x-7 gap-y-4 pt-3">
            <div>
              <BigNumber value={live.length} unit="live" />
              <div className="mt-2.5 flex gap-3 text-xs text-[var(--st-on-card-muted)]">
                <span>{paused.length} paused</span>
                <span>{signalsOn} built-in signal{signalsOn === 1 ? "" : "s"} on</span>
              </div>
            </div>
            <span className="flex-1" />
            <dl className="m-0 flex w-full min-w-0 flex-col gap-1.5 pb-1 text-xs text-[var(--st-on-card-muted)] sm:w-auto sm:min-w-[250px] sm:max-w-[340px]">
              <Fired label="Last fired" value={latest ? `${latest.when} · ${latest.what}` : "Not yet"} />
              <Fired label="Weekly digest" value={signalsFired.healthDigest ?? "Not yet"} />
              <Fired label="Quiet-staff check" value={signalsFired.quietStaff ?? "Not yet"} />
            </dl>
          </div>
        </StudioCard>

        <StudioCard texture="dots" className="min-h-[200px] lg:h-[220px]">
          <CardHead label="Quick recipes" right={<span>one tap, then adjust</span>} />
          <div className="flex flex-1 flex-wrap content-end gap-1.5 pt-3">
            {/* A phone shows the first few and the rest in a sheet — all fifteen
                made this card half the screen, and the list comes first. */}
            {RECIPES.map((r, i) => (
              <button key={r.label} type="button" title={r.hint} onClick={() => build(r)} className={cn(recipeChip, i >= PHONE_RECIPES && "max-sm:hidden")}>
                {r.label}
              </button>
            ))}
            <button type="button" onClick={() => setAllRecipes(true)} className={cn(recipeChip, "gap-1 sm:hidden")}>
              {RECIPES.length - PHONE_RECIPES} more<ChevronRight size={12} />
            </button>
          </div>
        </StudioCard>
      </StudioCardRow>

      <div ref={bottom} className="flex flex-col gap-5 lg:min-h-0 lg:flex-row">
        <section className="flex min-w-0 flex-col rounded-[20px] bg-[var(--st-surface)] px-4 py-4 sm:px-[22px] sm:py-5 lg:min-h-0 lg:flex-1">
          <div className="flex min-h-[26px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="m-0 text-[15px] font-semibold">{view === "live" ? "Live" : "Paused"} · {shown.length}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--st-muted)] max-md:hidden">{view === "live" ? "test, pause or cancel any of them" : "switched off — flip one back on any time"}</span>
              <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist" aria-label="Show">
                {([["live", "Live", live.length], ["paused", "Paused", paused.length]] as const).map(([k, l, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
                    className={cn("flex h-[26px] items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors",
                      view === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                    {l}<span className="tabular-nums text-[var(--st-muted)]">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {rules.length === 0 ? (
            <Empty />
          ) : shown.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--st-muted)]">
              {view === "live" ? "Every automation is paused — flip one back on under Paused." : "Nothing is paused."}
            </div>
          ) : (
            <>
              <ul className="m-0 mt-1.5 flex min-h-0 list-none flex-col overflow-y-auto p-0">
                {shown.map((r) => <RuleRow key={r.id} r={r} />)}
              </ul>
              <div className="shrink-0 pt-2.5 text-xs text-[var(--st-muted)]">Each row opens its past firings.</div>
            </>
          )}
        </section>

        <OriSignals settings={signals} lastFired={signalsFired} className="lg:w-[420px] lg:shrink-0 lg:overflow-y-auto" />
      </div>

      <StudioSheet open={allRecipes} onClose={() => setAllRecipes(false)} title="Quick recipes" icon={<Sparkles size={15} />}>
        <p className="m-0 mb-2 text-xs text-[var(--sh-muted)]">One tap fills in the builder; adjust it, then save.</p>
        <ul className="m-0 flex list-none flex-col p-0">
          {RECIPES.map((r) => (
            <li key={r.label} className="border-b border-[var(--sh-line)] last:border-b-0">
              <button type="button" onClick={() => build(r)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{r.label}</span>
                  <span className="block text-xs text-[var(--sh-muted)]">{r.hint}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-[var(--sh-muted)]" />
              </button>
            </li>
          ))}
        </ul>
      </StudioSheet>
    </StudioScope>
  );
}

function Fired({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-4">
      <dt className="shrink-0">{label}</dt>
      <dd className="m-0 min-w-0 truncate text-[var(--st-on-card)]" title={value}>{value}</dd>
    </div>
  );
}

function RuleRow({ r }: { r: DescribedRule }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<{ at: string; note: string }[] | null>(null);
  const Icon = kindIcon(r.kind);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && history === null) ruleFiringsAction(r.id).then(setHistory);
  }
  function onToggle() {
    start(async () => {
      const res = await toggleAutomationActive(r.id, !r.active);
      if (!res.ok) toast(res.error ?? "Could not update.", { tone: "danger" });
      else {
        toast(r.active ? "Paused — it will not fire until you switch it back on." : "Switched back on.", { tone: "success" });
        router.refresh();
      }
    });
  }
  function onTest() {
    setTesting(true);
    (async () => {
      const res = await testAutomationAction(r.id);
      if (!res.ok) toast(res.error ?? "Could not run the test.", { tone: "danger" });
      else if (res.fired > 0) toast("Fired — check your notifications.", { tone: "success" });
      else toast("Nothing was due, so nothing fired.", { tone: "default" });
      setTesting(false);
      setHistory(null);
      router.refresh();
    })();
  }
  function onCancel() {
    start(async () => {
      const res = await cancelAutomation(r.id);
      if (!res.ok) toast(res.error ?? "Could not cancel.", { tone: "danger" });
      else {
        toast("Automation cancelled.", { tone: "success" });
        router.refresh();
      }
      setConfirming(false);
    });
  }

  const iconBtn = "grid h-[30px] w-[30px] place-items-center rounded-lg text-[var(--st-sub)] transition-colors hover:bg-[var(--st-page)] hover:text-[var(--st-ink)] disabled:opacity-50";

  return (
    <li className="border-b border-[var(--st-line-soft)] last:border-b-0">
      <div role="button" tabIndex={0} aria-expanded={open} onClick={toggleOpen}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); toggleOpen(); } }}
        className="grid cursor-pointer grid-cols-[30px_minmax(0,1fr)_auto_auto] items-center gap-x-3 py-2.5 outline-none focus-visible:bg-[var(--st-page)] sm:grid-cols-[30px_minmax(0,1fr)_120px_30px_40px_30px]">
        <span className={cn("grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-[var(--st-page)] text-[var(--st-sub)]", !r.active && "opacity-60")}><Icon size={14} /></span>
        <span className={cn("min-w-0", !r.active && "opacity-60")}>
          <span className="block truncate text-[13px]" title={r.title}>{r.title}</span>
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--st-muted)]">
            {open ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />}
            <span className="truncate">
              {r.kindLabel} · {r.target}{r.done && " · completed"}
              <span className="sm:hidden"> · {r.lastFired ? `fired ${r.lastFired}` : "not fired yet"}</span>
            </span>
          </span>
        </span>
        <span className="text-xs text-[var(--st-sub)] max-sm:hidden">{r.lastFired ?? "Not fired yet"}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onTest(); }} disabled={testing} aria-label="Test this automation now" title="Test now" className={cn(iconBtn, "max-sm:hidden")}>
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        </button>
        <span className="flex justify-center">
          <OriToggle on={r.active} onChange={onToggle} busy={busy && !confirming} label={r.active ? "Pause this automation" : "Switch this automation back on"} />
        </span>
        <button type="button" onClick={(e) => { e.stopPropagation(); setConfirming(true); }} disabled={busy} aria-label="Cancel this automation" title="Cancel" className={cn(iconBtn, "text-[var(--st-muted)] hover:text-[var(--st-late-text)] max-sm:hidden")}>
          <Trash2 size={14} />
        </button>
        <span className="sm:hidden" onClick={(e) => e.stopPropagation()}>
          <RowMenu label="More for this automation">
            <MenuItem onSelect={onTest} icon={testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}>Test now</MenuItem>
            <MenuItem onSelect={toggleOpen} icon={<ChevronRight size={14} />}>{open ? "Hide past firings" : "Past firings"}</MenuItem>
            <MenuLine />
            <MenuItem onSelect={() => setConfirming(true)} icon={<Trash2 size={14} />} tone="bad">Cancel it</MenuItem>
          </RowMenu>
        </span>
      </div>

      {confirming && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--st-bad-wash)] px-3 py-2 text-xs">
          <span className="min-w-0 flex-1">Cancel this automation? It stops firing; the record is kept.</span>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-7 rounded-lg border border-[var(--st-line)] bg-[var(--st-surface)] px-3 hover:bg-[var(--st-page)] disabled:opacity-60">Keep</button>
          <button type="button" onClick={onCancel} disabled={busy} className="flex h-7 items-center gap-1.5 rounded-lg bg-[var(--st-late)] px-3 font-medium text-white hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={12} className="animate-spin" />}Yes, cancel
          </button>
        </div>
      )}

      {open && (
        <div className="mb-2.5 ml-[42px] rounded-xl bg-[var(--st-page)] px-3 py-2.5 text-xs">
          <div className="mb-1.5 font-medium">Past firings</div>
          {history === null ? (
            <span className="text-[var(--st-muted)]">Loading…</span>
          ) : history.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {history.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-[92px] shrink-0 text-[var(--st-muted)]">{relTime(h.at) ?? "—"}</span>
                  <span className="min-w-0 text-[var(--st-sub)]">{h.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[var(--st-muted)]">No recorded firings yet.</span>
          )}
          {(r.lastRun || r.createdAt) && (
            <div className="mt-2 text-[var(--st-muted)]">
              {r.lastRun && <>Last checked {r.lastRun}</>}{r.lastRun && r.createdAt && " · "}{r.createdAt && <>Set up {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Dar_es_Salaam" })}</>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Empty() {
  return (
    <div className="m-auto max-w-sm py-10 text-center">
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-[var(--st-page)] text-[var(--st-sub)]"><Sparkles size={20} /></span>
      <p className="m-0 text-sm font-medium">ORI isn&rsquo;t watching anything yet</p>
      <p className="mx-auto mt-1.5 text-xs text-[var(--st-muted)]">
        Build one with <b className="font-medium text-[var(--st-ink)]">New automation</b> or a quick recipe — or ask in the command palette, e.g.{" "}
        <span className="text-[var(--st-ink)]">&ldquo;tell me when PES raises a blocker&rdquo;</span>. The standing rule appears here to pause or cancel.
      </p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--st-muted)]"><Command size={12} /> Open the palette with Ctrl + Space</p>
    </div>
  );
}
