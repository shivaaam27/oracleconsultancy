"use client";
/**
 * Studio Recurring (design/studio-mockup, board Recurring) — what /task/recurring
 * draws when Settings → New look → Recurring tasks is on.
 *
 * ⚠️ RESTYLED, NOT REWIRED. Every save goes through the same four actions the
 * old panel used (`src/app/task/recurring-actions.ts`), and adding or editing a
 * rule opens the SAME `RecurringTaskSheet`. The dates come from
 * `nextOccurrences`, which is built on `occursToday` — the function the job
 * itself asks — so the page cannot promise a day the job will not act on.
 *
 *   header  "Recurring" · company menu · All / Weekly / Monthly · + New rule
 *   cards   This week (how many rules, and a bar per day)  |  Next up — or, once
 *           a row is picked, that rule in full with Edit and its switch
 *   list    one card per rule: the days it repeats, the next task, when it last
 *           made one, who set it up, the on/off switch, edit and remove
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, X, Repeat } from "lucide-react";
import { StudioScope, StudioHeader, StudioCard, CardHead, BigNumber, StudioPill, stBtn } from "@/components/studio/kit";
import { StudioMenu } from "@/components/studio/tasks/controls";
import { StudioFaces } from "@/components/studio/tasks/cells";
import { RecordList, type RecordColumn } from "@/components/record-list";
import { RecurringTaskSheet, BLANK, draftFromRule, type Draft } from "@/components/portal-recurring-tasks";
import { Switch } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useUrlFilters } from "@/lib/use-url-filters";
import { creatorLabel, nextOccurrences, occursToday, type RecurringTaskRule, type RecurringTaskInput } from "@/lib/recurring-task-rules";
import type { PickerCompany, PickerPerson } from "@/lib/portal-picker";
import {
  createRecurringTask, updateRecurringTask, setRecurringTaskPaused, deleteRecurringTask,
} from "@/app/task/recurring-actions";
import { cn } from "@/lib/cn";

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const LETTER: Record<number, string> = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S" };
const DAY: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

/** Dar es Salaam's calendar date for an instant, "yyyy-mm-dd". */
const darDate = (t: number) => new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);
/** The instant of 09:00 Dar on a "yyyy-mm-dd" — a moment safely inside that day. */
const darNoon = (iso: string) => Date.parse(`${iso}T06:00:00Z`);

function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function lastMade(iso: string | null, today: string): string {
  if (!iso) return "Not yet";
  const d = darDate(Date.parse(iso));
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return `Today, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" })}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return dayLabel(d, today);
}

function Days({ r }: { r: RecurringTaskRule }) {
  if (r.cadence === "monthly") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--st-ink)] px-2 text-[11px] font-medium text-[var(--st-page)]">
        <Repeat size={11} />Day {r.dayOfMonth ?? 1} · monthly
      </span>
    );
  }
  return (
    <span className="flex gap-1" aria-label={r.weekdays.map((w) => DAY[w]).join(", ")}>
      {WEEK.map((w) => {
        const on = r.weekdays.includes(w);
        return (
          <span key={w} className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-[10px] font-medium",
            on ? "bg-[var(--st-ink)] text-[var(--st-page)]" : "bg-[var(--st-page)] text-[var(--st-muted)]")}>
            {LETTER[w]}
          </span>
        );
      })}
    </span>
  );
}

export function StudioRecurring({ rules, companies, people }: { rules: RecurringTaskRule[]; companies: PickerCompany[]; people: PickerPerson[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const f = useUrlFilters({ company: "", repeats: "" });
  const [picked, setPicked] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; editing: number | null; draft: Draft }>({ open: false, editing: null, draft: BLANK });
  const [working, setWorking] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const pickCard = useRef<HTMLDivElement>(null);

  const [now] = useState(() => Date.now());
  const today = darDate(now);

  // The header's company menu narrows everything below it; the segment narrows the list.
  const inCompany = useMemo(() => rules.filter((r) => !f.values.company || String(r.companyId) === f.values.company), [rules, f.values.company]);
  const next = useMemo(() => new Map(rules.map((r) => [r.id, nextOccurrences(r, 3, new Date(now))])), [rules, now]);
  // Soonest to make a task first; switched-off rules sink to the bottom.
  const shown = useMemo(() => inCompany
    .filter((r) => !f.values.repeats || r.cadence === f.values.repeats)
    .sort((x, y) => (next.get(x.id)?.[0] ?? "9999").localeCompare(next.get(y.id)?.[0] ?? "9999") || x.title.localeCompare(y.title)),
  [inCompany, f.values.repeats, next]);
  const weekly = inCompany.filter((r) => r.cadence === "weekly").length;
  const monthly = inCompany.length - weekly;
  const off = inCompany.filter((r) => r.paused).length;


  // This week, Monday to Sunday in Dar: how many live rules make a task each day.
  const week = useMemo(() => {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = Date.parse(`${today}T00:00:00Z`) - ((dow + 6) % 7) * 86_400_000;
    return WEEK.map((w, i) => {
      const iso = new Date(monday + i * 86_400_000).toISOString().slice(0, 10);
      const n = inCompany.filter((r) => !r.paused && occursToday({ cadence: r.cadence, weekdays: r.weekdays, dayOfMonth: r.dayOfMonth ?? 1 }, new Date(darNoon(iso)))).length;
      return { w, iso, n };
    });
  }, [inCompany, today]);
  const peak = Math.max(1, ...week.map((d) => d.n));

  // Next up: the soonest runs, the same title on the same day folded into one line.
  const upcoming = useMemo(() => {
    const byKey = new Map<string, { date: string; title: string; companies: string[] }>();
    for (const r of inCompany) for (const d of next.get(r.id) ?? []) {
      const k = `${d}|${r.title.trim().toLowerCase()}`;
      const e = byKey.get(k) ?? { date: d, title: r.title, companies: [] };
      if (r.companyName) e.companies.push(r.companyName);
      byKey.set(k, e);
    }
    return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)).slice(0, 5);
  }, [inCompany, next]);

  const pickedRule = picked != null ? rules.find((r) => r.id === picked) ?? null : null;
  const peopleById = new Map(people.map((p) => [p.id, p.name]));

  function openNew() {
    setSheet({ open: true, editing: null, draft: { ...BLANK, companyName: companies.find((c) => String(c.id) === f.values.company)?.name ?? "" } });
  }
  function openEdit(r: RecurringTaskRule) {
    setSheet({ open: true, editing: r.id, draft: draftFromRule(r, companies, people) });
  }
  function save(input: RecurringTaskInput) {
    start(async () => {
      const res = sheet.editing != null ? await updateRecurringTask(sheet.editing, input) : await createRecurringTask(input);
      if (!res.ok) { toast(res.error ?? "Could not save.", { tone: "danger" }); return; }
      toast(sheet.editing != null ? "Rule updated." : "Rule saved.", { tone: "success" });
      setSheet((s) => ({ ...s, open: false }));
      router.refresh();
    });
  }
  function toggle(r: RecurringTaskRule) {
    setWorking(r.id);
    start(async () => {
      const res = await setRecurringTaskPaused(r.id, !r.paused);
      setWorking(null);
      if (!res.ok) { toast(res.error ?? "Could not update it.", { tone: "danger" }); return; }
      toast(r.paused ? "Switched on." : "Switched off — its settings are kept.", { tone: "success" });
      router.refresh();
    });
  }
  function remove(r: RecurringTaskRule) {
    if (confirmDel !== r.id) { setConfirmDel(r.id); return; }
    setConfirmDel(null);
    setWorking(r.id);
    start(async () => {
      const res = await deleteRecurringTask(r.id);
      setWorking(null);
      if (!res.ok) { toast(res.error ?? "Could not remove it.", { tone: "danger" }); return; }
      if (picked === r.id) setPicked(null);
      toast("Rule removed. Tasks it already made are untouched.", { tone: "success" });
      router.refresh();
    });
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const columns: RecordColumn<RecurringTaskRule>[] = [
    {
      key: "rule", label: "Rule", width: "minmax(0,1.6fr)",
      render: (r) => (
        <div className={cn("min-w-0", r.paused && "opacity-50")}>
          <div className="truncate text-[14px] font-medium">{r.title || "Untitled"}</div>
          <div className="truncate text-xs text-[var(--st-muted)]">
            {r.companyName || "—"}
            {/* On a phone the Next column folds away — its date rides here. */}
            <span className="sm:hidden"> · {r.paused ? "off" : next.get(r.id)?.[0] ? dayLabel(next.get(r.id)![0], today) : "—"}</span>
          </div>
        </div>
      ),
      csv: (r) => r.title,
    },
    { key: "repeats", label: "Repeats", width: "190px", hideBelow: "md", render: (r) => <Days r={r} />, csv: (r) => (r.cadence === "monthly" ? `Day ${r.dayOfMonth} monthly` : r.weekdays.map((w) => DAY[w]).join(" ")) },
    {
      key: "next", label: "Next task", width: "110px", hideBelow: "sm",
      render: (r) => {
        const d = next.get(r.id)?.[0];
        return <span className={cn("whitespace-nowrap text-[13px]", !d && "text-[var(--st-muted)]")}>{r.paused ? "Off" : d ? dayLabel(d, today) : "—"}</span>;
      },
      csv: (r) => next.get(r.id)?.[0] ?? "",
    },
    { key: "last", label: "Last created", width: "120px", hideBelow: "lg", render: (r) => <span className="whitespace-nowrap text-[13px] text-[var(--st-sub)]">{lastMade(r.lastFiredAt, today)}</span>, csv: (r) => r.lastFiredAt ?? "" },
    {
      key: "by", label: "Set up by", width: "150px", hideBelow: "lg",
      render: (r) => <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--st-sub)]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--st-violet)]" /><span className="truncate">{creatorLabel(r.createdBy)}</span></span>,
      csv: (r) => creatorLabel(r.createdBy),
    },
    {
      key: "on", label: "On", width: "96px",
      render: (r) => (
        <span className="flex items-center gap-0.5" onClick={stop}>
          <button type="button" role="switch" aria-checked={!r.paused} aria-label={r.paused ? "Switch on" : "Switch off"} disabled={busy && working === r.id} onClick={() => toggle(r)} className="mr-1 inline-flex h-7 items-center">
            <Switch on={!r.paused} size="sm" busy={busy && working === r.id} />
          </button>
          <button type="button" aria-label="Edit" onClick={() => openEdit(r)} className="grid h-7 w-7 place-items-center rounded-lg text-[var(--st-muted)] hover:bg-[var(--st-page)] hover:text-[var(--st-ink)]"><Pencil size={13} /></button>
          <button type="button" aria-label={confirmDel === r.id ? "Press again to remove" : "Remove"} data-remove title={confirmDel === r.id ? "Press again to remove" : "Remove"} onClick={() => remove(r)} onBlur={() => setConfirmDel(null)}
            className={cn("hidden h-7 w-7 place-items-center rounded-lg sm:grid", confirmDel === r.id ? "bg-[var(--st-late)] text-white" : "text-[var(--st-muted)] hover:bg-[var(--st-page)] hover:text-[var(--st-late-text)]")}>
            {busy && working === r.id && !confirmDel ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </span>
      ),
    },
  ];

  const companyOptions = [
    { key: "", label: "All companies", href: f.hrefFor({ company: "" }), active: !f.values.company, count: rules.length },
    ...companies
      .map((c) => ({ c, n: rules.filter((r) => r.companyId === c.id).length }))
      .filter(({ n }) => n > 0)
      .map(({ c, n }) => ({ key: String(c.id), label: c.name, href: f.hrefFor({ company: String(c.id) }), active: f.values.company === String(c.id), count: n })),
  ];
  const segs: [string, string, number][] = [["", "All", inCompany.length], ["weekly", "Weekly", weekly], ["monthly", "Monthly", monthly]];

  return (
    <StudioScope className="space-y-5">
      <StudioHeader
        title="Recurring"
        left={<StudioMenu label={companies.find((c) => String(c.id) === f.values.company)?.name ?? "All companies"} options={companyOptions} searchable />}
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist" aria-label="Repeats">
              {segs.map(([k, l, n]) => (
                <button key={l} type="button" role="tab" aria-selected={f.values.repeats === k} onClick={() => f.set({ repeats: k })}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors",
                    f.values.repeats === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  {l}<span className="tabular-nums text-[var(--st-muted)]">{n}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={openNew} className={stBtn.dark}><Plus size={14} />New rule</button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StudioCard texture="rings" className="min-h-[210px]">
          <CardHead label="This week" right={<span className="text-[var(--st-on-card-muted)]">{dayLabel(today, "")}</span>} />
          <div className="mt-auto flex flex-wrap items-end justify-between gap-6 pt-4">
            <div>
              <BigNumber value={inCompany.length} unit={inCompany.length === 1 ? "rule" : "rules"} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StudioPill onCard dot={off ? "var(--st-soon)" : "var(--st-ok)"}>{off ? `${off} switched off` : "All live"}</StudioPill>
              </div>
              <div className="mt-2 text-xs text-[var(--st-on-card-muted)]">{weekly} weekly · {monthly} monthly</div>
            </div>
            <div className="flex items-end gap-2.5" aria-label="Tasks made each day this week">
              {week.map((d) => {
                const isToday = d.iso === today;
                return (
                  <div key={d.iso} className="flex w-8 flex-col items-center gap-1.5">
                    <span className="text-[11px] tabular-nums text-[var(--st-on-card-muted)]">{d.n}</span>
                    <span className="st-rise block w-full rounded-md"
                      style={{ height: d.n ? Math.max(10, Math.round((d.n / peak) * 72)) : 4, background: isToday ? "var(--st-on-card)" : d.n ? "var(--st-ok)" : "var(--st-card-line)" }} />
                    <span className={cn("text-[11px]", isToday ? "font-semibold text-[var(--st-on-card)]" : "text-[var(--st-on-card-muted)]")}>{DAY[d.w]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </StudioCard>

        <div ref={pickCard} className="flex min-w-0"><StudioCard texture="hatch" className="min-h-[210px] w-full">
          {pickedRule ? (
            <>
              <CardHead label="Rule" right={<button type="button" onClick={() => setPicked(null)} aria-label="Back to next up" className="grid h-7 w-7 place-items-center rounded-lg text-[var(--st-on-card-muted)] hover:bg-[var(--st-card-2)] hover:text-[var(--st-on-card)]"><X size={14} /></button>} />
              <div className="mt-2 text-[22px] font-medium leading-tight tracking-[-0.02em]">{pickedRule.title}</div>
              <div className="mt-1 text-xs text-[var(--st-on-card-muted)]">
                {pickedRule.companyName || "—"} · {pickedRule.cadence === "monthly" ? `day ${pickedRule.dayOfMonth} of each month` : pickedRule.weekdays.map((w) => DAY[w]).join(", ")} · set up by {creatorLabel(pickedRule.createdBy)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StudioPill onCard>{pickedRule.priority} priority</StudioPill>
                <StudioPill onCard>Starts {pickedRule.status}</StudioPill>
                {pickedRule.assigneePersonIds.length > 0 && <StudioFaces names={pickedRule.assigneePersonIds.map((id) => peopleById.get(id) ?? "?")} />}
              </div>
              {pickedRule.description && <p className="mt-3 line-clamp-2 text-[13px] text-[var(--st-on-card-muted)]">{pickedRule.description}</p>}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="text-xs text-[var(--st-on-card-muted)]">
                  {pickedRule.paused ? "Switched off — nothing will be made." : `Next: ${(next.get(pickedRule.id) ?? []).map((d) => dayLabel(d, today)).join(" · ") || "—"}`}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => remove(pickedRule)} onBlur={() => setConfirmDel(null)} className={cn(stBtn.onCardGhost, confirmDel === pickedRule.id && "border-[var(--st-late)] text-[var(--st-late)]")}>
                    <Trash2 size={12} />{confirmDel === pickedRule.id ? "Press again" : "Remove"}
                  </button>
                  <button type="button" onClick={() => toggle(pickedRule)} className={stBtn.onCardGhost}>{pickedRule.paused ? "Switch on" : "Switch off"}</button>
                  <button type="button" onClick={() => openEdit(pickedRule)} className={stBtn.onCard}><Pencil size={12} />Edit</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <CardHead label="Next up" right={<span className="text-[var(--st-on-card-muted)]">Pick a rule to see it here</span>} />
              {upcoming.length === 0 ? (
                <div className="m-auto text-sm text-[var(--st-on-card-muted)]">Nothing is due to be made.</div>
              ) : (
                <ul className="mt-3 flex flex-col">
                  {upcoming.map((u) => {
                    const soon = Date.parse(`${u.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) <= 86_400_000;
                    return (
                      <li key={u.date + u.title} className="flex items-center gap-4 border-t border-[var(--st-card-line)] py-2.5 first:border-t-0">
                        <span className={cn("w-[84px] shrink-0 text-xs", soon ? "text-[var(--st-ok)]" : "text-[var(--st-on-card-muted)]")}>{dayLabel(u.date, today)}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{u.title}{u.companies.length > 1 && <span className="text-[var(--st-on-card-muted)]"> × {u.companies.length} companies</span>}</span>
                        <span className="hidden max-w-[40%] truncate text-xs text-[var(--st-on-card-muted)] sm:block">{u.companies.join(" · ")}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </StudioCard></div>
      </div>

      <RecordList
        variant="studio"
        listKey="recurring-studio"
        exportName="Recurring tasks"
        rows={shown}
        rowKey={(r) => r.id}
        columns={columns}
        onRowClick={(r) => {
          setPicked(r.id === picked ? null : r.id);
          // On a phone the card sits above the list, out of sight — bring it up.
          if (r.id !== picked && window.matchMedia("(max-width: 1023px)").matches) {
            requestAnimationFrame(() => pickCard.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
          }
        }}
        activeKey={picked}
        empty={
          <div className="py-10 text-center text-sm text-[var(--st-muted)]">
            {rules.length === 0 ? "No rules yet — a rule makes the same task on chosen days each week or month." : "No rules match."}
          </div>
        }
      />

      <RecurringTaskSheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        editing={sheet.editing != null}
        initial={sheet.draft}
        companies={companies}
        people={people}
        busy={busy}
        onSave={save}
        studio
      />
    </StudioScope>
  );
}
