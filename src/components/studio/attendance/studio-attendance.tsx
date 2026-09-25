"use client";

/**
 * Attendance in Studio (26 Sept 2026, mockup board Attendance) — today's tally
 * and the next public holiday on top, then the month register you paint with a
 * brush, or the Holidays list. On a phone the 31-column grid becomes ONE DAY:
 * step through the days and tap a person to paint them.
 *
 * Writes are the register's own actions (recordAttendanceAction,
 * bulkRecordAttendanceAction, add/deleteHolidayAction). A holiday cell is
 * derived and cannot be painted over; a staff self check-in carries a dot.
 */
import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Eraser, Loader2, Paintbrush, X } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, stBtn } from "@/components/studio/kit";
import { StudioMenu } from "@/components/studio/tasks/controls";
import { SelectField } from "@/components/forms/select-field";
import { DateInput } from "@/components/forms/date-input";
import { useToast } from "@/components/shell/toast";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { recordAttendanceAction, bulkRecordAttendanceAction, addHolidayAction, deleteHolidayAction } from "@/app/hrms/leave/actions";
import type { AttendanceMonth } from "@/lib/people/attendance";
import type { AttendanceStatus } from "@/lib/people/leave-shared";
import { cn } from "@/lib/cn";

export type HolidayRow = { id: number; date: string; name: string; companyId: number | null; companyName: string | null };
type Brush = Exclude<AttendanceStatus, "Holiday"> | "Clear";

const LOOK: Record<AttendanceStatus, { k: string; bg: string; fg: string }> = {
  Present: { k: "P", bg: "#19C37D", fg: "#FFFFFF" },
  Absent: { k: "A", bg: "#E0479E", fg: "#FFFFFF" },
  "On leave": { k: "L", bg: "#2490EF", fg: "#FFFFFF" },
  Remote: { k: "R", bg: "#8B5CF6", fg: "#FFFFFF" },
  "Half-day": { k: "½", bg: "#F5A524", fg: "#111214" },
  Sick: { k: "S", bg: "#F0703A", fg: "#FFFFFF" },
  Holiday: { k: "H", bg: "#E4E4E0", fg: "#55585E" },
};
const BRUSHES: Brush[] = ["Present", "Absent", "On leave", "Remote", "Half-day", "Sick", "Clear"];
const WD = ["S", "M", "T", "W", "T", "F", "S"];
const eatToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
const dayLabel = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

export function StudioAttendance({ month, holidays, companies, view }: {
  month: AttendanceMonth; holidays: HolidayRow[]; companies: { id: number; name: string }[]; view: "register" | "holidays";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const f = useUrlFilters({ co: "" });
  const [brush, setBrush] = useState<Brush>("Present");
  const [today] = useState(eatToday);
  const [phoneDay, setPhoneDay] = useState(() => (month.days.includes(today) ? today : month.days[0]));
  // Optimistic paint: the cell changes as you click; the server catches up.
  const [local, setLocal] = useState<Record<string, AttendanceStatus | null>>({});

  const people = useMemo(() => (f.values.co ? month.people.filter((p) => String(p.companyId ?? "") === f.values.co) : month.people), [month.people, f.values.co]);
  const cell = (pid: number, day: string): { status: AttendanceStatus | null; derived: boolean; self: string | null } => {
    const key = `${pid}:${day}`;
    if (key in local) return { status: local[key], derived: false, self: null };
    const rec = month.recorded[key];
    if (rec) {
      const note = month.notes[key] ?? "";
      return { status: rec, derived: false, self: note.startsWith("portal:") ? note.slice(7) : null };
    }
    if (month.leave[key]) return { status: "On leave", derived: true, self: null };
    if (month.holidays[day]) return { status: "Holiday", derived: true, self: null };
    return { status: null, derived: false, self: null };
  };

  const paint = (pid: number, day: string, derived: boolean) => {
    if (derived) { toast("That day fills itself in — it is a public holiday.", { tone: "warn" }); return; }
    const status = brush === "Clear" ? null : brush;
    setLocal((m) => ({ ...m, [`${pid}:${day}`]: status }));
    start(async () => {
      const r = await recordAttendanceAction(pid, day, status);
      if (!r.ok) { toast(r.error || "Couldn't save.", { tone: "warn" }); setLocal((m) => { const n = { ...m }; delete n[`${pid}:${day}`]; return n; }); return; }
      router.refresh();
    });
  };

  const isThisMonth = month.days.includes(today);
  const todayCells = people.map((p) => cell(p.id, today));
  const tally = (s: AttendanceStatus) => todayCells.filter((c) => c.status === s).length;
  const marked = todayCells.filter((c) => c.status && c.status !== "Holiday").length;
  const selfToday = todayCells.filter((c) => c.self).length;
  const unmarked = people.filter((p, i) => !todayCells[i].status);
  const markRest = () => {
    const ids = unmarked.map((p) => p.id);
    if (!ids.length) return;
    setLocal((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [`${id}:${today}`, "Present" as const])) }));
    start(async () => {
      const r = await bulkRecordAttendanceAction(ids, today, "Present");
      toast(r.ok ? `${ids.length} marked present today.` : r.error || "Couldn't save.", { tone: r.ok ? "success" : "warn" });
      router.refresh();
    });
  };

  const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const prev = month.month === 1 ? ym(month.year - 1, 12) : ym(month.year, month.month - 1);
  const next = month.month === 12 ? ym(month.year + 1, 1) : ym(month.year, month.month + 1);
  const withParams = (patch: Record<string, string>) => {
    const p = new URLSearchParams(f.query);
    if (view === "holidays") p.set("view", "holidays");
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return `/hrms/leave${s ? `?${s}` : ""}`;
  };
  const upcoming = holidays.filter((h) => h.date.slice(0, 10) >= today);
  const nextHol = upcoming[0];
  const co = companies.find((c) => String(c.id) === f.values.co);

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Attendance"
        left={<StudioMenu label={co?.name ?? "All companies"} searchable={companies.length > 8} options={[
          { key: "all", label: "All companies", href: f.hrefFor({ co: "" }), active: !f.values.co },
          ...companies.map((c) => ({ key: String(c.id), label: c.name, href: f.hrefFor({ co: String(c.id) }), active: f.values.co === String(c.id), count: month.people.filter((p) => p.companyId === c.id).length })).filter((o) => o.count > 0),
        ]} />}
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
              {([["register", "Register", null], ["holidays", "Holidays", upcoming.length]] as const).map(([k, l, n]) => (
                <Link key={k} href={k === "holidays" ? `/hrms/leave?view=holidays${f.values.co ? `&co=${f.values.co}` : ""}` : `/hrms/leave${f.values.co ? `?co=${f.values.co}` : ""}`} role="tab" aria-selected={view === k} scroll={false}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors", view === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  {l}{n != null && <span className="text-[11px] font-normal text-[var(--st-muted)]">{n}</span>}
                </Link>
              ))}
            </div>
            {view === "register" && (
              <div className="flex h-9 items-center gap-1 rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-1">
                <Link href={withParams({ ym: prev })} scroll={false} aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--st-page)]"><ChevronLeft size={14} /></Link>
                <span className="px-1.5 text-[13px] font-medium"><span className="sm:hidden">{dayLabel(`${ym(month.year, month.month)}-01`, { month: "short", year: "2-digit" })}</span><span className="max-sm:hidden">{dayLabel(`${ym(month.year, month.month)}-01`, { month: "long", year: "numeric" })}</span></span>
                <Link href={withParams({ ym: next })} scroll={false} aria-label="Next month" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--st-page)]"><ChevronRight size={14} /></Link>
              </div>
            )}
            {isThisMonth && view === "register" && (
              <button type="button" disabled={pending || unmarked.length === 0} onClick={markRest} className={cn(stBtn.dark, "disabled:opacity-40")}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span className="sm:hidden">{unmarked.length ? "All present" : "All marked"}</span>
                <span className="max-sm:hidden">{marked === 0 ? "Mark all present today" : unmarked.length ? `Mark the other ${unmarked.length} present` : "Everyone is marked"}</span>
              </button>
            )}
          </>
        }
      />

      <StudioCardRow className="lg:h-[196px]">
        <StudioCard className="min-h-[180px]">
          <CardHead label={`Today · ${dayLabel(today, { weekday: "short", day: "numeric", month: "short" })}`} right={<span>{marked} of {people.length} marked</span>} />
          <div className="mt-auto flex items-end gap-6 pt-3">
            <div className="grid flex-1 grid-cols-4 gap-4">
              {(["Present", "Absent", "On leave", "Remote"] as const).map((s) => (
                <div key={s}>
                  <div className="text-[34px] leading-none tracking-[-0.03em] tabular-nums">{tally(s)}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--st-on-card-muted)]"><span className="h-[7px] w-[7px] rounded-full" style={{ background: LOOK[s].bg }} />{s === "On leave" ? "on leave" : s.toLowerCase()}</div>
                </div>
              ))}
            </div>
            <div className="hidden max-w-[190px] text-xs leading-relaxed text-[var(--st-on-card-muted)] xl:block">
              {selfToday ? `${selfToday} checked themselves in from the portal — those show a small dot.` : "Staff can check themselves in from the portal — those show a small dot."}
            </div>
          </div>
        </StudioCard>
        <StudioCard texture="contour" className="min-h-[180px]">
          <CardHead label="Public holidays" right={<span>{upcoming.length} coming up</span>} />
          <div className="mt-auto flex flex-col gap-2.5 pt-3">
            {nextHol ? (
              <>
                <div className="text-[22px] font-medium tracking-[-0.015em]">{nextHol.name}</div>
                <div className="text-[13px] text-[var(--st-on-card-muted)]">
                  {dayLabel(nextHol.date.slice(0, 10), { weekday: "long", day: "numeric", month: "long" })} · {daysAway(nextHol.date.slice(0, 10), today)} · {nextHol.companyName ?? "every company"}
                </div>
              </>
            ) : (
              <>
                <div className="text-[22px] font-medium tracking-[-0.015em]">No holidays coming up</div>
                <div className="max-w-[440px] text-[13px] leading-relaxed text-[var(--st-on-card-muted)]">Add each public holiday once — for every company or one — and it fills the register by itself and can’t be painted over.</div>
              </>
            )}
            <div><Link href={`/hrms/leave?view=holidays${f.values.co ? `&co=${f.values.co}` : ""}`} className={stBtn.onCard}><CalendarPlus size={13} />{nextHol ? "All holidays" : "Add a holiday"}</Link></div>
          </div>
        </StudioCard>
      </StudioCardRow>

      {view === "register" ? (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-[var(--st-surface)]">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--st-line-soft)] px-4 py-3">
            <span className="mr-1 flex items-center gap-1.5 text-xs text-[var(--st-muted)]"><Paintbrush size={14} />Paint</span>
            {BRUSHES.map((b) => {
              const on = brush === b;
              const look = b === "Clear" ? null : LOOK[b];
              return (
                <button key={b} type="button" aria-pressed={on} onClick={() => setBrush(b)}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 text-xs transition-colors", on ? "border-[var(--st-ink)] bg-[var(--st-page)]" : "border-[var(--st-line)] hover:bg-[var(--st-page)]")}>
                  <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] text-[10px] font-semibold" style={{ background: look?.bg ?? "var(--st-page)", color: look?.fg ?? "var(--st-ink)" }}>{look ? look.k : <Eraser size={11} />}</span>
                  {b}
                </button>
              );
            })}
            <span className="flex-1" />
            <span className="hidden text-xs text-[var(--st-muted)] lg:inline">Click a day to paint it · Sundays shaded · today outlined</span>
          </div>

          {people.length === 0 ? (
            <p className="m-0 py-10 text-center text-[13px] text-[var(--st-muted)]">Nobody works for this company.</p>
          ) : (
            <>
              {/* Desk and tablet: the month. */}
              <div className="hidden overflow-x-auto px-4 pb-3 pt-2 sm:block">
                <div className="grid min-w-[900px] items-center gap-[3px]" style={{ gridTemplateColumns: `190px repeat(${month.days.length}, minmax(22px, 1fr))` }}>
                  <span className="text-[11px] text-[var(--st-muted)]">Person</span>
                  {month.days.map((d) => {
                    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
                    return (
                      <span key={d} title={month.holidays[d] || undefined} className={cn("text-center text-[10px] leading-[1.2]", d === today ? "font-bold text-[var(--st-ink)]" : dow === 0 ? "text-[#C4C5C9]" : "text-[var(--st-muted)]", month.holidays[d] && "text-[#2490EF]")}>
                        {Number(d.slice(8))}<br />{WD[dow]}
                      </span>
                    );
                  })}
                  {people.map((p) => (
                    <Row key={p.id} name={p.name}>
                      {month.days.map((d) => {
                        const c = cell(p.id, d);
                        const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
                        const look = c.status ? LOOK[c.status] : null;
                        return (
                          <button key={d} type="button" onClick={() => paint(p.id, d, c.derived)}
                            title={`${p.name} · ${dayLabel(d, { day: "numeric", month: "short" })}${c.status ? ` · ${c.status}${c.derived ? " (automatic)" : c.self ? " (checked in themselves)" : ""}` : ""}`}
                            aria-label={`${p.name}, ${d}: ${c.status ?? "not marked"}`}
                            className={cn("relative h-[26px] rounded-[5px] p-0 text-[10px] font-semibold transition-[filter] hover:brightness-95", c.derived && "cursor-not-allowed opacity-70")}
                            style={{ background: look?.bg ?? (dow === 0 ? "var(--st-page)" : "#FAFAF8"), color: look?.fg, border: d === today ? "1.5px solid var(--st-ink)" : "1px solid var(--st-line-soft)" }}>
                            {look?.k}
                            {c.self && <span aria-hidden className="absolute right-[2px] top-[2px] h-[5px] w-[5px] rounded-full bg-current opacity-80" />}
                          </button>
                        );
                      })}
                    </Row>
                  ))}
                </div>
              </div>

              {/* Phone: one day at a time. */}
              <div className="flex flex-col sm:hidden">
                <div className="flex items-center gap-2 border-b border-[var(--st-line-soft)] px-3 py-2">
                  <button type="button" aria-label="Previous day" disabled={phoneDay === month.days[0]} onClick={() => setPhoneDay(month.days[month.days.indexOf(phoneDay) - 1])} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-[var(--st-page)] disabled:opacity-30"><ChevronLeft size={17} /></button>
                  <span className="flex-1 text-center text-[14px] font-medium">{phoneDay === today ? "Today · " : ""}{dayLabel(phoneDay, { weekday: "short", day: "numeric", month: "short" })}{month.holidays[phoneDay] ? ` · ${month.holidays[phoneDay]}` : ""}</span>
                  <button type="button" aria-label="Next day" disabled={phoneDay === month.days[month.days.length - 1]} onClick={() => setPhoneDay(month.days[month.days.indexOf(phoneDay) + 1])} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-[var(--st-page)] disabled:opacity-30"><ChevronRight size={17} /></button>
                </div>
                {people.map((p) => {
                  const c = cell(p.id, phoneDay);
                  const look = c.status ? LOOK[c.status] : null;
                  return (
                    <button key={p.id} type="button" onClick={() => paint(p.id, phoneDay, c.derived)} className="flex min-h-[52px] items-center gap-3 border-b border-[var(--st-line-soft)] px-4 text-left last:border-0 active:bg-[var(--st-page)]">
                      <span className="min-w-0 flex-1 truncate text-[14px]">{p.name}</span>
                      {look ? <span className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium" style={{ background: look.bg, color: look.fg }}>{c.status}{c.self ? " ·  self" : ""}</span>
                        : <span className="text-xs text-[var(--st-muted)]">Tap → {brush}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ) : (
        <Holidays holidays={holidays} companies={companies} today={today} />
      )}
    </StudioScope>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <span className="truncate pr-2 text-xs">{name.replace(/^(Mr|Mrs|Ms|Miss|Dr|Chef)\.?\s+/i, "")}</span>
      {children}
    </>
  );
}

function daysAway(d: string, today: string) {
  const n = Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

function Holidays({ holidays, companies, today }: { holidays: HolidayRow[]; companies: { id: number; name: string }[]; today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const upcoming = holidays.filter((h) => h.date.slice(0, 10) >= today);
  const past = holidays.filter((h) => h.date.slice(0, 10) < today).reverse();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { toast(r.error || "Couldn't save.", { tone: "warn" }); return; }
      toast(ok, { tone: "success" }); after?.(); router.refresh();
    });
  const line = (h: HolidayRow, dim = false) => (
    <div key={h.id} className={cn("group grid grid-cols-[120px_minmax(0,1fr)_auto_32px] items-center gap-3 border-b border-[var(--st-line-soft)] py-2.5 text-[13px] last:border-0", dim && "text-[var(--st-muted)]")}>
      <span className="tabular-nums">{dayLabel(h.date.slice(0, 10), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
      <span className="truncate font-medium">{h.name}</span>
      <span className="truncate text-xs text-[var(--st-muted)]">{h.companyName ?? "Every company"}</span>
      <button type="button" aria-label={`Remove ${h.name}`} disabled={pending} onClick={() => act(() => deleteHolidayAction(h.id), "Removed.")}
        className="grid h-7 w-7 place-items-center rounded-lg text-[var(--st-muted)] hover:bg-[var(--st-page)] hover:text-[var(--st-ink)]"><X size={13} /></button>
    </div>
  );
  return (
    <div className="grid grid-cols-1 items-start gap-5 pb-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className={cn("rounded-[20px] bg-[var(--st-surface)] p-5", holidays.length === 0 && "st-tex-paper-rings flex min-h-[240px] items-center justify-center")}>
        {holidays.length === 0 ? (
          <div className="rounded-xl bg-[var(--st-surface)] px-5 py-3.5 text-center text-[14px] text-[var(--st-sub)]">No holidays yet. Each one you add lists here with its date and company.</div>
        ) : (
          <>
            <h2 className="m-0 text-[15px] font-semibold">Coming up</h2>
            <div className="mt-2">{upcoming.length ? upcoming.map((h) => line(h)) : <p className="m-0 py-3 text-[13px] text-[var(--st-muted)]">Nothing coming up.</p>}</div>
            {past.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-[13px] text-[var(--st-muted)]">Earlier ({past.length})</summary>
                <div className="mt-1">{past.map((h) => line(h, true))}</div>
              </details>
            )}
          </>
        )}
      </section>
      <section className="rounded-[20px] bg-[var(--st-surface)] p-5">
        <h2 className="m-0 text-[15px] font-semibold">Add a public holiday</h2>
        <form key={formKey} className="st-form mt-3 flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (!fd.get("date")) { toast("Pick a date.", { tone: "warn" }); return; }
          act(() => addHolidayAction(fd), "Holiday added.", () => setFormKey((k) => k + 1));
        }}>
          <label className="block"><span className="mb-1.5 block text-xs text-[var(--st-muted)]">Holiday name</span><input name="name" required placeholder="e.g. Independence Day" className="st-field h-10 w-full rounded-[10px] px-3 text-[13px] outline-none" /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-[var(--st-muted)]">Date</span><span className="st-date block"><DateInput name="date" placeholder="Pick a date" /></span></label>
          <label className="block"><span className="mb-1.5 block text-xs text-[var(--st-muted)]">Company</span><SelectField name="companyId" defaultValue="" options={[{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} /></label>
          <button type="submit" disabled={pending} className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[var(--st-ink)] text-[13px] font-semibold text-[var(--st-page)] disabled:opacity-50">{pending && <Loader2 size={14} className="animate-spin" />}Add holiday</button>
        </form>
      </section>
    </div>
  );
}
