"use client";

/**
 * Cleaning — the administrator's log, in Studio (26 Sept 2026, mockup board
 * Cleaning). The receptionist ticks the rooms from her portal; this is the same
 * day with the power to step in: tick, comment, set who cleaned, write the day
 * note, sign the day off (which locks it) or unlock it, and walk back through
 * previous days. Every write is the page's own action in hrms/cleaning/actions.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, History, Loader2, Lock, MessageSquare, PenLine, Unlock } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, Ring, stBtn } from "@/components/studio/kit";
import { StudioSheet } from "@/components/studio/sheet";
import { FluidSelect } from "@/components/forms/fluid-select";
import { useToast } from "@/components/shell/toast";
import { toggleCheckAction, setCheckCommentAction, setAttendanceAction, setNoteAction, signDayAction } from "@/app/hrms/cleaning/actions";
import { portalCleaningToggle, portalCleaningComment, portalCleaningNote, portalCleaningSign, portalCleaningUnlock } from "@/app/portal/(app)/cleaning/actions";
import { completion, dayStatus, type CleaningArea, type CleaningCheck, type CleaningDay, type DayStatus } from "@/lib/operations/cleaning-shared";
import { cn } from "@/lib/cn";

export type CleaningHistoryDay = { dateIso: string; status: DayStatus; cleanerName: string | null; done: number; total: number };
type CheckState = { done: boolean; doneAt: Date | null; comment: string | null };

const EAT = "Africa/Nairobi";
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const time = (d: Date | null) => (d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: EAT }) : "");
const shift = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const STATUS_ON_CARD: Record<DayStatus, string> = { Signed: "#5BE0A5", Complete: "#5BE0A5", "In progress": "#F5B94E", "Not started": "#C9CBCF" };
const STATUS_DOT: Record<DayStatus, string> = { Signed: "var(--st-ok)", Complete: "var(--st-ok)", "In progress": "var(--st-soon)", "Not started": "#B9BBBF" };

export function StudioCleaningToday({ dateIso, today, floor, day, areas, checks, people, history, portal = null }: {
  dateIso: string; today: string; floor: string; day: CleaningDay; areas: CleaningArea[]; checks: CleaningCheck[];
  people: { id: number; name: string }[]; history: CleaningHistoryDay[];
  /** The receptionist on the portal (26 Sept 2026): today only, her own
   *  actions (portal/(app)/cleaning/actions — each checks cleaningLog), and
   *  submitting signs the day as her and counts as her attendance. */
  portal?: { name: string } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const initial = useMemo(() => {
    const m: Record<number, CheckState> = {};
    for (const a of areas) m[a.id] = { done: false, doneAt: null, comment: null };
    for (const c of checks) m[c.areaId] = { done: c.done, doneAt: c.doneAt, comment: c.comment };
    return m;
  }, [areas, checks]);
  const [state, setState] = useState(initial);
  useEffect(() => setState(initial), [initial]);
  const [note, setNote] = useState(day.note ?? "");
  useEffect(() => setNote(day.note ?? ""), [day.note]);
  const [cleaner, setCleaner] = useState(day.attendancePersonId != null ? String(day.attendancePersonId) : "");
  useEffect(() => setCleaner(day.attendancePersonId != null ? String(day.attendancePersonId) : ""), [day.attendancePersonId]);
  const [commentFor, setCommentFor] = useState<CleaningArea | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const signed = !!day.signedAt;
  const doneN = areas.filter((a) => state[a.id]?.done).length;
  const comp = completion(doneN, areas.length);
  const status = dayStatus(day, doneN, areas.length);

  const toggle = (a: CleaningArea) => {
    if (signed) { toast("The day is signed off — unlock it to change anything.", { tone: "warn" }); return; }
    const next = !state[a.id]?.done;
    setState((s) => ({ ...s, [a.id]: { ...s[a.id], done: next, doneAt: next ? new Date() : null } }));
    start(async () => {
      const r = portal ? await portalCleaningToggle(day.id, a.id, next) : await toggleCheckAction(day.id, a.id, next);
      if (!r.ok) { toast(r.error, { tone: "warn" }); setState(initial); }
    });
  };
  const saveNote = () => {
    if (note === (day.note ?? "")) return;
    start(async () => { const r = portal ? await portalCleaningNote(day.id, note) : await setNoteAction(day.id, note); if (!r.ok) toast(r.error, { tone: "warn" }); });
  };
  const saveCleaner = (v: string) => {
    setCleaner(v);
    start(async () => { const r = await setAttendanceAction(day.id, v ? Number(v) : null); if (!r.ok) toast(r.error, { tone: "warn" }); else router.refresh(); });
  };
  const unlock = () => start(async () => {
    const r = portal ? await portalCleaningUnlock(day.id) : await signDayAction(day.id, false, null, null);
    if (!r.ok) { toast(r.error, { tone: "warn" }); return; }
    toast("Unlocked.", { tone: "success" }); router.refresh();
  });

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Cleaning"
        right={
          <>
            {!portal && <div className="flex h-9 items-center gap-1 rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-1">
              {dateIso <= floor
                ? <span className="grid h-7 w-7 place-items-center text-[var(--st-line)]"><ChevronLeft size={14} /></span>
                : <Link href={`/hrms/cleaning?date=${shift(dateIso, -1)}`} scroll={false} aria-label="Previous day" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--st-page)]"><ChevronLeft size={14} /></Link>}
              {dateIso === today
                ? <span className="px-1.5 text-[13px] font-medium">Today</span>
                : <Link href="/hrms/cleaning" scroll={false} className="rounded-md px-1.5 text-[13px] font-medium hover:underline" title="Back to today">{shortDate(dateIso)}</Link>}
              {dateIso >= today
                ? <span className="grid h-7 w-7 place-items-center text-[var(--st-line)]"><ChevronRight size={14} /></span>
                : <Link href={`/hrms/cleaning?date=${shift(dateIso, 1)}`} scroll={false} aria-label="Next day" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--st-page)]"><ChevronRight size={14} /></Link>}
            </div>}
            {signed
              ? <button type="button" disabled={pending} onClick={unlock} className={stBtn.ghost}><Unlock size={14} />Unlock the day</button>
              : <button type="button" onClick={() => setSignOpen(true)} className={stBtn.dark}><Check size={14} />{portal ? "Submit the day" : "Sign off the day"}</button>}
          </>
        }
      />

      <StudioCardRow className="lg:h-[220px]">
        <StudioCard className="min-h-[200px]">
          <CardHead label={longDate(dateIso)} right={<span style={{ color: STATUS_ON_CARD[status] }}>{signed ? `Signed off${day.signedByName ? ` by ${day.signedByName}` : ""}${day.signedAt ? ` · ${time(day.signedAt)}` : ""}` : status === "Complete" ? "Complete — sign it off" : status}</span>} />
          <div className="mt-auto flex items-end gap-6 pt-3">
            <Ring value={comp.pct} size={128} stroke={13} color="#19C37D" track="var(--st-card-line)" label={`${comp.done}/${comp.total}`} sub="areas done" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1.5">
              <div className="text-xs text-[var(--st-on-card-muted)]">Who cleaned today</div>
              {portal ? <div className="text-[18px]">{people.find((p) => String(p.id) === cleaner)?.name ?? portal.name}</div> : <div className="max-w-[260px] [&_button]:!h-9 [&_button]:!rounded-[10px] [&_button]:!border-[#2E3035] [&_button]:!bg-[#1F2023] [&_button]:!text-[#F2F2F0]">
                <FluidSelect value={cleaner} onSelect={saveCleaner} placeholder="Not set" className="w-full" options={[{ value: "", label: "Not set" }, ...people.map((p) => ({ value: String(p.id), label: p.name }))]} />
              </div>}
              <div className="text-xs text-[var(--st-on-card-muted)]">{signed ? <span className="inline-flex items-center gap-1.5"><Lock size={12} />Locked until someone presses Unlock.</span> : portal ? "Tick each room as you finish it, then submit the day." : "The receptionist ticks from the portal; you can step in here."}</div>
            </div>
          </div>
        </StudioCard>
        <StudioCard texture="dots" className="min-h-[200px]">
          <CardHead label="Day note" right={<span>optional · saves when you click away</span>} />
          <div className="mt-auto flex flex-col gap-2.5 pt-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} disabled={signed} rows={3}
              placeholder="Anything worth recording about today’s cleaning…"
              className="bare-field w-full resize-none rounded-xl border border-[#2E3035] bg-[#1F2023] px-3 py-2.5 text-[13px] text-[#F2F2F0] outline-none placeholder:text-[#8E9197] focus:border-[#55585E] disabled:opacity-60" />
            <div className="flex items-center gap-2.5 text-xs text-[var(--st-on-card-muted)]">
              <span className="flex-1">Once signed off, ticks lock until someone presses Unlock.</span>
              {history.length > 0 && <button type="button" onClick={() => setPastOpen(true)} className={stBtn.onCardGhost}><History size={13} />Previous days</button>}
            </div>
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="grid grid-cols-1 gap-3 pb-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {areas.length === 0 && <p className="col-span-full py-8 text-center text-[13px] text-[var(--st-muted)]">No cleaning areas set up.</p>}
        {areas.map((a) => {
          const s = state[a.id] ?? { done: false, doneAt: null, comment: null };
          return (
            <div key={a.id} className={cn("flex items-center gap-3.5 rounded-2xl border-[1.5px] bg-[var(--st-surface)] px-4 py-3.5 transition-colors", s.done ? "border-[#CFEFDF] dark:border-[#1D4D37]" : "border-transparent")}>
              <button type="button" aria-pressed={s.done} aria-label={`${s.done ? "Untick" : "Tick"} ${a.name}`} onClick={() => toggle(a)} disabled={signed}
                className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border-[1.5px] text-white transition-colors disabled:cursor-not-allowed", s.done ? "border-[#19C37D] bg-[#19C37D]" : "border-[#DADAD5] bg-[var(--st-surface)] hover:border-[#19C37D]")}>
                <Check size={18} strokeWidth={3} className={s.done ? "" : "opacity-0"} />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{a.name}</span>
                <span className={cn("block truncate text-xs", s.done ? "text-[var(--st-ok-text)]" : "text-[var(--st-muted)]")}>{s.done ? `Done${s.doneAt ? ` at ${time(s.doneAt)}` : ""}` : "Not done yet"}{s.comment ? ` · ${s.comment}` : ""}</span>
              </span>
              <button type="button" aria-label={`Comment on ${a.name}`} onClick={() => setCommentFor(a)} disabled={signed}
                className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[9px] transition-colors hover:bg-[var(--st-page)] disabled:opacity-40", s.comment ? "text-[var(--st-ink)]" : "text-[var(--st-muted)]")}><MessageSquare size={15} /></button>
            </div>
          );
        })}
      </div>

      <CommentSheet area={commentFor} initial={commentFor ? state[commentFor.id]?.comment ?? "" : ""} onClose={() => setCommentFor(null)}
        onSave={(area, text) => {
          setState((s) => ({ ...s, [area.id]: { ...s[area.id], comment: text.trim() || null } }));
          setCommentFor(null);
          start(async () => { const r = portal ? await portalCleaningComment(day.id, area.id, text) : await setCheckCommentAction(day.id, area.id, text); if (!r.ok) toast(r.error, { tone: "warn" }); });
        }} />
      <SignSheet open={signOpen} onClose={() => setSignOpen(false)} people={portal ? [] : people} doneN={doneN} total={areas.length} asName={portal?.name ?? null}
        onSign={(name, personId) => start(async () => {
          const r = portal ? await portalCleaningSign(day.id) : await signDayAction(day.id, true, name, personId);
          if (!r.ok) { toast(r.error, { tone: "warn" }); return; }
          toast("Day signed off.", { tone: "success" }); setSignOpen(false); router.refresh();
        })} pending={pending} />
      <StudioSheet open={pastOpen} onClose={() => setPastOpen(false)} width={520} icon={<History size={15} />} title="Previous days">
        {history.length === 0 ? <p className="m-0 py-4 text-center text-[13px] text-[var(--sh-muted)]">Nothing logged yet.</p> : (
          <div className="flex flex-col">
            {history.map((h) => (
              <Link key={h.dateIso} href={`/hrms/cleaning?date=${h.dateIso}`} onClick={() => setPastOpen(false)} className="grid grid-cols-[120px_minmax(0,1fr)_60px_auto] items-center gap-3 rounded-lg px-2 py-2.5 text-[13px] hover:bg-[var(--sh-hover)]">
                <span>{shortDate(h.dateIso)}</span>
                <span className="truncate text-[var(--sh-sub)]">{h.cleanerName ?? "Cleaner not set"}</span>
                <span className="tabular-nums">{h.done}/{h.total}</span>
                <span className="inline-flex items-center gap-1.5 text-xs"><span className="h-[7px] w-[7px] rounded-full" style={{ background: STATUS_DOT[h.status] }} />{h.status}</span>
              </Link>
            ))}
          </div>
        )}
      </StudioSheet>
    </StudioScope>
  );
}

function CommentSheet({ area, initial, onClose, onSave }: { area: CleaningArea | null; initial: string; onClose: () => void; onSave: (a: CleaningArea, t: string) => void }) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial, area]);
  return (
    <StudioSheet open={!!area} onClose={onClose} width={460} icon={<MessageSquare size={15} />} title={area ? `Comment on ${area.name}` : ""}
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={stBtn.ghost}>Cancel</button><button type="button" onClick={() => area && onSave(area, text)} className={stBtn.dark}>Save comment</button></div>}>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. bin not emptied, tap dripping"
        className="st-field w-full rounded-[10px] px-3 py-2.5 text-[13px] outline-none" />
    </StudioSheet>
  );
}

function SignSheet({ open, onClose, people, doneN, total, onSign, pending, asName = null }: {
  open: boolean; onClose: () => void; people: { id: number; name: string }[]; doneN: number; total: number;
  onSign: (name: string, personId: number | null) => void; pending: boolean; asName?: string | null;
}) {
  const [who, setWho] = useState("me");
  useEffect(() => { if (open) setWho("me"); }, [open]);
  const person = people.find((p) => String(p.id) === who);
  return (
    <StudioSheet open={open} onClose={onClose} width={460} icon={<PenLine size={15} />} title={asName ? "Submit the day" : "Sign off the day"}
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={stBtn.ghost}>Cancel</button>
        <button type="button" disabled={pending} onClick={() => onSign(person?.name ?? "Administrator", person?.id ?? null)} className={stBtn.dark}>{pending && <Loader2 size={14} className="animate-spin" />}{asName ? "Submit" : "Sign off"}</button></div>}>
      <div className="st-form flex flex-col gap-3">
        {doneN < total && <p className="m-0 rounded-xl bg-[var(--sh-pink-bg)] px-3 py-2.5 text-[13px] text-[var(--sh-pink-fg)]">{total - doneN} area{total - doneN === 1 ? " is" : "s are"} not ticked. Signing off locks the day as it is.</p>}
        {asName ? <p className="m-0 text-[13px]">Submitted as <b className="font-medium">{asName}</b> — it also marks you present today. It can be unlocked if a room needs changing.</p> : (
          <label className="block"><span className="mb-1.5 block text-xs text-[var(--sh-muted)]">Signed off by</span>
            <FluidSelect value={who} onSelect={setWho} className="w-full" options={[{ value: "me", label: "Me (administrator)" }, ...people.map((p) => ({ value: String(p.id), label: p.name }))]} />
          </label>
        )}
      </div>
    </StudioSheet>
  );
}
