"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SITE — the MEALS and LABOUR tick-sheets (Phase 6).
//
// The workbook spreads ~110 days across ~110 COLUMNS, which is the only thing a
// spreadsheet can do with a date. Here one row per person per day holds both
// facts, and the screen shows a fortnight at a time with arrows to move.
//
// ⚠️ Painting the grid does NOT refresh the page. A refresh per square would
// fight the tick you just made, and on this connection each write takes about a
// second. The grid holds its own state and the server confirms each square; the
// page re-reads on navigation.
//
// ⚠️ Both budget figures are looked up BY CATEGORY NAME. In the workbook
// `MEALS!C42 = SNAPSHOT!E13` and `LABOUR!C39 = SNAPSHOT!E8` point at fixed ROWS
// of a gauge that is sorted by size — so meals reads SAND's budget and labour
// reads CEMENT's. A name cannot be re-sorted out from under you.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, UserMinus, Utensils, HardHat } from "lucide-react";
import { cn } from "@/lib/cn";
import { Combobox } from "./combobox";
import { SetupNeeded } from "./setup-needed";
import { createRefAction } from "@/app/projects/[id]/setup/actions";
import { MoneyInput } from "./money-input";
import { money } from "@/lib/project-budget-shared";
import { num } from "@/lib/projects-shared";
import {
  dateRange, isSunday, personTotals, siteTotals, fedOnDay, paidOnDay,
  SITE_PERSON_KINDS, type SitePerson, type SiteDay,
} from "@/lib/project-site-shared";
import {
  addSitePersonAction, setSitePersonActiveAction, setSiteDayAction,
} from "@/app/projects/[id]/site/actions";

const DAYS_SHOWN = 14;

export function ProjectSiteSheet({
  projectId, people: serverPeople, days: serverDays, mealRate,
  budgetByCategory, spentByCategory, startDate, designations, currency,
}: {
  projectId: number;
  people: SitePerson[];
  days: SiteDay[];
  mealRate: number | null;
  budgetByCategory: Array<[string, number]>;
  spentByCategory: Array<[string, number]>;
  /** The project's start date, so the grid opens somewhere sensible. */
  startDate: string | null;
  /** From the Setup tab. */
  designations: string[];
  currency: string;
}) {
  const [people, setPeople] = useState(serverPeople);
  const [days, setDays] = useState(serverDays);
  const [mode, setMode] = useState<"meals" | "labour">("meals");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const seededFor = useRef(projectId);
  useEffect(() => {
    if (seededFor.current !== projectId) {
      seededFor.current = projectId;
      setPeople(serverPeople);
      setDays(serverDays);
    }
  }, [projectId, serverPeople, serverDays]);

  // The window opens on today, or on the project start if that is later.
  const [anchor, setAnchor] = useState(() => {
    const today = new Date();
    today.setUTCDate(today.getUTCDate() - (DAYS_SHOWN - 1));
    const t = today.toISOString().slice(0, 10);
    return startDate && startDate > t ? startDate : t;
  });

  const window = useMemo(() => {
    const end = new Date(`${anchor}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + DAYS_SHOWN - 1);
    return dateRange(anchor, end.toISOString().slice(0, 10));
  }, [anchor]);

  const shift = (by: number) => {
    const d = new Date(`${anchor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + by);
    setAnchor(d.toISOString().slice(0, 10));
  };

  const dayFor = useMemo(() => {
    const m = new Map<string, SiteDay>();
    for (const d of days) m.set(`${d.personId}|${d.day}`, d);
    return m;
  }, [days]);

  const active = people.filter((p) => p.active);
  const totals = personTotals(active, days);
  const summary = siteTotals(totals, {
    mealRate,
    budgetByCategory: new Map(budgetByCategory),
    spentByCategory: new Map(spentByCategory),
  });

  /** Write one square. Optimistic — the tick must feel instant. */
  const paint = (person: SitePerson, day: string, next: { meal?: boolean; labourAmount?: string | null }) => {
    const key = `${person.id}|${day}`;
    const existing = dayFor.get(key);
    const merged: SiteDay = {
      id: existing?.id ?? -Math.random(),
      personId: person.id, day,
      meal: next.meal ?? existing?.meal ?? false,
      labourAmount: next.labourAmount !== undefined ? next.labourAmount : existing?.labourAmount ?? null,
    };
    setDays((prev) => {
      const without = prev.filter((d) => !(d.personId === person.id && d.day === day));
      return [...without, merged];
    });
    void setSiteDayAction({
      projectId, personId: person.id, day,
      meal: merged.meal, labourAmount: merged.labourAmount,
    }).then((res) => { if (!res.ok) setError(res.error ?? "Couldn't save that day."); });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Tile label="Meals payable" value={money(summary.mealsPayable) ?? "—"}
          sub={mealRate === null ? "set a meal rate on the project" : `${summary.headcountDays} person-days × ${money(mealRate)}`} />
        <Tile label="Meals budget" value={money(summary.mealsBudget) ?? "—"}
          sub={summary.mealsBudget === null ? "no MEALS budget line" : "matched by name"} />
        <Tile label="Wages recorded" value={money(summary.labourPayable) ?? "0"} />
        <Tile label="Labour budget" value={money(summary.labourBudget) ?? "—"}
          sub={summary.labourBudget === null ? "no LABOUR budget line" : "matched by name"} />
      </div>

      <SetupNeeded projectId={projectId} missing={designations.length ? [] : ["Designations"]} />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {([["meals", "Meals", Utensils], ["labour", "Labour", HardHat]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setMode(k)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px]",
              mode === k ? "border-accent/40 bg-accent-soft font-medium text-accent" : "border-border bg-bg-elev text-fg-muted")}>
            <Icon size={13} /> {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => shift(-DAYS_SHOWN)} title="Earlier"
            className="rounded border border-border p-1.5 text-fg-muted hover:text-fg"><ChevronLeft size={14} /></button>
          <span className="tabular px-1 text-[11px] text-fg-muted">
            {window[0]} → {window[window.length - 1]}
          </span>
          <button type="button" onClick={() => shift(DAYS_SHOWN)} title="Later"
            className="rounded border border-border p-1.5 text-fg-muted hover:text-fg"><ChevronRight size={14} /></button>
          <button type="button" onClick={() => setAdding((v) => !v)}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg">
            <Plus size={13} /> Add person
          </button>
        </div>
      </div>

      {adding && (
        <AddPerson projectId={projectId} designations={designations} currency={currency}
          onDone={(p) => { setPeople((prev) => [...prev, p]); setAdding(false); }}
          onError={setError} />
      )}

      {active.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-elev p-6 text-center">
          <p className="text-[13px] font-medium">Nobody on site yet</p>
          <p className="mt-1 text-[12px] text-fg-subtle">Add the foreman and the casuals, then tick their days.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse bg-bg-elev text-[12px]">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <th className="sticky left-0 z-10 bg-bg-subtle px-2 py-1.5 text-left font-medium">Name</th>
                {window.map((d) => (
                  <th key={d} className={cn("w-9 px-0 py-1.5 text-center text-[10px] font-normal",
                    isSunday(d) ? "bg-bg-muted text-fg-subtle" : "text-fg-muted")}
                    title={d}>
                    {d.slice(8)}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {active.map((p) => {
                const t = totals.find((x) => x.person.id === p.id)!;
                return (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="sticky left-0 z-10 min-w-[150px] bg-bg-elev px-2 py-1">
                      <span className="block truncate">{p.name}</span>
                      <span className="block truncate text-[10px] text-fg-subtle">
                        {[p.designation, p.kind === "PERMANENT" ? "permanent" : "casual",
                          p.dailyRate ? money(num(p.dailyRate)) + "/day" : null].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    {window.map((d) => {
                      const cell = dayFor.get(`${p.id}|${d}`);
                      return (
                        <td key={d} className={cn("p-0 text-center", isSunday(d) && "bg-bg-muted/40")}>
                          {mode === "meals" ? (
                            <button type="button"
                              disabled={!p.mealsEligible}
                              onClick={() => paint(p, d, { meal: !cell?.meal })}
                              title={p.mealsEligible ? `${p.name} — ${d}` : `${p.name} is not fed on site`}
                              className={cn("h-7 w-full text-[11px] disabled:opacity-30",
                                cell?.meal ? "bg-success-soft text-success" : "text-fg-subtle hover:bg-bg-muted")}>
                              {cell?.meal ? "✓" : ""}
                            </button>
                          ) : (
                            <LabourCell
                              value={cell?.labourAmount ?? ""}
                              defaultRate={p.dailyRate}
                              onCommit={(v) => paint(p, d, { labourAmount: v })}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right tabular">
                      {mode === "meals" ? `${t.mealDays} days` : money(t.labourPaid)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-bg-subtle font-medium">
                <td className="sticky left-0 z-10 bg-bg-subtle px-2 py-1.5">
                  {mode === "meals" ? "Fed that day" : "Paid that day"}
                </td>
                {window.map((d) => (
                  <td key={d} className="px-0 py-1.5 text-center tabular text-[10px]">
                    {mode === "meals"
                      ? (fedOnDay(days, d) || "")
                      : (paidOnDay(days, d) ? Math.round(paidOnDay(days, d) / 1000) + "k" : "")}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular">
                  {mode === "meals" ? `${summary.headcountDays} total` : money(summary.labourPayable)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[11px] text-fg-subtle">
        <span>Sundays are shaded — they are not working days on this site.</span>
        {mode === "labour" && <span>Leave a cell blank for a day not worked; the daily rate fills in on click.</span>}
        {people.some((p) => !p.active) && (
          <span>{people.filter((p) => !p.active).length} person(s) taken off the roster.</span>
        )}
      </div>

      {active.length > 0 && (
        <details className="rounded-lg border border-border bg-bg-elev">
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium">Roster ({active.length})</summary>
          <div className="divide-y divide-border border-t border-border">
            {active.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-[11px] text-fg-subtle">{p.kind}</span>
                <span className="tabular w-24 text-right text-[11px]">{money(num(p.dailyRate)) ?? "—"}</span>
                <span className="w-16 text-right text-[11px] text-fg-subtle">{p.mealsEligible ? "fed" : "not fed"}</span>
                <button type="button" title="Take off the roster"
                  onClick={() => {
                    if (!confirm(`Take ${p.name} off the roster? Their recorded days are kept.`)) return;
                    setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: false } : x)));
                    void setSitePersonActiveAction(p.id, projectId, false);
                  }}
                  className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger">
                  <UserMinus size={13} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── the cell ── */

/**
 * A labour square.
 *
 * ⚠️ COMMITS ON A SHORT TIMER, NOT ON BLUR. The first version committed in
 * `onBlur` and nothing was ever saved: the meals ticks (plain buttons) wrote
 * fine while every wage typed into the grid was lost. A grid is not a form —
 * people tab, click another cell, or simply stop typing and look away, and any
 * of those may not deliver the blur you were relying on. A short debounce after
 * the last keystroke always fires. Blur and Enter still commit immediately, so
 * moving on deliberately feels instant.
 *
 * Amounts are shown in THOUSANDS (18 means 18,000) because a 110-day grid has no
 * room for six digits a cell, and site wages are always round thousands.
 */
function LabourCell({
  value, defaultRate, onCommit,
}: {
  value: string; defaultRate: string | null; onCommit: (v: string | null) => void;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const has = local !== "" && local !== null;

  const commit = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    onCommit(v === "" ? null : v);
  };
  const schedule = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(v === "" ? null : v), 600);
  };

  return (
    <input
      value={has ? String(Math.round(Number(local) / 1000)) : ""}
      onFocus={() => {
        // An empty square takes this person's daily rate on the first touch —
        // which is how the sheet is actually used, the same figure across a row.
        if (!has && defaultRate) { setLocal(defaultRate); commit(defaultRate); }
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "");
        const next = raw === "" ? "" : String(Number(raw) * 1000);
        setLocal(next);
        schedule(next);
      }}
      onBlur={() => commit(local)}
      onKeyDown={(e) => { if (e.key === "Enter") { commit(local); (e.target as HTMLInputElement).blur(); } }}
      title={has ? money(Number(local)) ?? "" : "not worked"}
      className={cn("h-7 w-full bg-transparent text-center text-[11px] tabular outline-none focus:bg-accent-soft",
        has ? "text-fg" : "text-fg-subtle")}
    />
  );
}

/* ────────────────────────────────────────────────────────────── add person ── */

function AddPerson({
  projectId, designations, currency, onDone, onError,
}: {
  projectId: number; designations: string[]; currency: string;
  onDone: (p: SitePerson) => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [kind, setKind] = useState<string>("CASUAL LABOUR");
  const [dailyRate, setDailyRate] = useState("");
  const [phone, setPhone] = useState("");
  const [mealsEligible, setMealsEligible] = useState(true);

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <L className="sm:col-span-3" label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></L>
        <L className="sm:col-span-3" label="Designation">
          <Combobox options={designations} defaultValue={designation} placeholder="Casual labourer"
            onInput={setDesignation} onCommit={setDesignation} className={inp}
            onCreate={(name) => createRefAction(projectId, "designation", name)}
            createNoun="designation" />
        </L>
        <L className="sm:col-span-2" label="Type">
          <div className="flex gap-1">
            {SITE_PERSON_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={cn("h-8 flex-1 rounded-md border px-1 text-[10px]",
                  kind === k ? "border-accent bg-accent-soft text-accent" : "border-border bg-bg text-fg-muted")}>
                {k === "PERMANENT" ? "Perm" : "Casual"}
              </button>
            ))}
          </div>
        </L>
        <L className="sm:col-span-2" label="Daily rate">
          <MoneyInput value={dailyRate} onChange={setDailyRate} currency={currency} placeholder="18000" />
        </L>
        <L className="sm:col-span-2" label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} /></L>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <button type="button" disabled={pending || !name.trim()}
          onClick={() => start(async () => {
            const res = await addSitePersonAction({ projectId, name, designation, kind, dailyRate, phone, mealsEligible });
            if (!res.ok) { onError(res.error ?? "Couldn't add."); return; }
            onDone({
              id: res.id ?? -Date.now(), projectId, name: name.trim(),
              designation: designation || null, kind,
              dailyRate: dailyRate.replace(/[\s,]/g, "") || null,
              phone: phone || null, mealsEligible, active: true, sortOrder: 9e6,
            });
          })}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add to roster
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          <input type="checkbox" checked={mealsEligible} onChange={(e) => setMealsEligible(e.target.checked)} />
          Fed on site
        </label>
      </div>
    </div>
  );
}

const inp = "h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent";

function L({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block h-4 text-[10px] uppercase tracking-[0.04em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg-elev px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className="tabular mt-0.5 text-[15px]">{value}</p>
      {sub && <p className="text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}
