"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, ChevronLeft, ChevronRight, MessageSquare, Lock, Unlock, PenLine, Calendar,
} from "lucide-react";
import { Card, Button, Select, Textarea, FieldLabel } from "@/components/ui";
import { useToast } from "@/components/toast";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { cn } from "@/lib/cn";
import {
  completion, dayStatus, dayStatusColor,
  type CleaningArea, type CleaningCheck, type CleaningDay,
} from "@/lib/cleaning-shared";
import {
  toggleCheckAction, setCheckCommentAction, setAttendanceAction, setNoteAction, signDayAction,
} from "@/app/hrms/cleaning/actions";

type Person = { id: number; name: string };
type CheckState = { done: boolean; doneAt: Date | null; comment: string | null };

const fmtLongDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const fmtTime = (d: Date | null) => (d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function Ring({ pct, done, total }: { pct: number; done: number; total: number }) {
  const r = 26, c = 2 * Math.PI * r;
  const tone = pct >= 100 ? "var(--color-success)" : pct > 0 ? "var(--color-warn)" : "var(--color-border-strong)";
  return (
    <div className="relative w-[68px] h-[68px] shrink-0">
      <svg width="68" height="68" className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--color-border)" strokeWidth="6" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} style={{ transition: "stroke-dashoffset .3s" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold tabular leading-none">{done}/{total}</span>
        <span className="text-[9px] text-fg-subtle">done</span>
      </div>
    </div>
  );
}

export function CleaningToday({
  dateIso, today, floor, day, areas, checks, people,
}: {
  dateIso: string;
  today: string;
  floor: string;
  day: CleaningDay;
  areas: CleaningArea[];
  checks: CleaningCheck[];
  people: Person[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [, start] = useTransition();

  const initial = useMemo(() => {
    const m: Record<number, CheckState> = {};
    for (const a of areas) m[a.id] = { done: false, doneAt: null, comment: null };
    for (const c of checks) m[c.areaId] = { done: c.done, doneAt: c.doneAt, comment: c.comment };
    return m;
  }, [areas, checks]);

  const [state, setState] = useState<Record<number, CheckState>>(initial);
  const [note, setNote] = useState(day.note ?? "");
  const [commentFor, setCommentFor] = useState<CleaningArea | null>(null);
  const [signOpen, setSignOpen] = useState(false);

  const signed = !!day.signedAt;
  const doneN = areas.filter((a) => state[a.id]?.done).length;
  const comp = completion(doneN, areas.length);
  const status = dayStatus(day, doneN, areas.length);

  function toggle(area: CleaningArea) {
    if (signed) { toast("Day is signed off — unlock to make changes.", { tone: "warn" }); return; }
    const next = !state[area.id]?.done;
    setState((s) => ({ ...s, [area.id]: { ...s[area.id], done: next, doneAt: next ? new Date() : null } }));
    start(async () => {
      const res = await toggleCheckAction(day.id, area.id, next);
      if (!res.ok) { toast(res.error, { tone: "warn" }); setState(initial); }
    });
  }

  function saveComment(area: CleaningArea, comment: string) {
    setState((s) => ({ ...s, [area.id]: { ...s[area.id], comment: comment.trim() || null } }));
    setCommentFor(null);
    start(async () => {
      const res = await setCheckCommentAction(day.id, area.id, comment);
      if (!res.ok) toast(res.error, { tone: "warn" });
    });
  }

  function saveAttendance(personId: number | null) {
    start(async () => {
      const res = await setAttendanceAction(day.id, personId);
      if (!res.ok) toast(res.error, { tone: "warn" }); else router.refresh();
    });
  }

  function saveNote() {
    if (note === (day.note ?? "")) return;
    start(async () => {
      const res = await setNoteAction(day.id, note);
      if (!res.ok) toast(res.error, { tone: "warn" });
    });
  }

  function doSign(name: string, personId: number | null) {
    start(async () => {
      const res = await signDayAction(day.id, true, name, personId);
      if (!res.ok) { toast(res.error, { tone: "warn" }); return; }
      toast("Day signed off.", { tone: "success" });
      setSignOpen(false);
      router.refresh();
    });
  }
  function unlock() {
    start(async () => {
      const res = await signDayAction(day.id, false, null, null);
      if (!res.ok) { toast(res.error, { tone: "warn" }); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Date nav */}
      <div className="flex items-center justify-between gap-2">
        <Link href={`/hrms/cleaning?date=${shiftDay(dateIso, -1)}`} aria-disabled={dateIso <= floor}
          className={cn("inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border",
            dateIso <= floor ? "opacity-40 pointer-events-none" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60")}>
          <ChevronLeft size={16} />
        </Link>
        <div className="text-center">
          <div className="text-sm font-medium">{fmtLongDate(dateIso)}</div>
          {dateIso !== today && (
            <Link href="/hrms/cleaning" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
              <Calendar size={11} /> Back to today
            </Link>
          )}
        </div>
        <Link href={`/hrms/cleaning?date=${shiftDay(dateIso, 1)}`}
          className={cn("inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border",
            dateIso >= today ? "opacity-40 pointer-events-none" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60")}>
          <ChevronRight size={16} />
        </Link>
      </div>

      {/* Summary + attendance */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Ring pct={comp.pct} done={comp.done} total={comp.total} />
          <div className="min-w-0 flex-1">
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", dayStatusColor[status])}>{status}</span>
            <div className="mt-2">
              <FieldLabel>Attendance — who cleaned</FieldLabel>
              <Select defaultValue={day.attendancePersonId != null ? String(day.attendancePersonId) : ""}
                disabled={signed}
                onChange={(e) => saveAttendance(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Not set —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {/* Signed banner */}
      {signed && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-success-soft/60 border border-success/20 text-sm">
          <Lock size={15} className="text-success shrink-0" />
          <span className="flex-1">
            Signed off{day.signedByName ? ` by ${day.signedByName}` : ""}{day.signedAt ? ` at ${fmtTime(day.signedAt)}` : ""}.
          </span>
          <Button size="xs" variant="ghost" onClick={unlock}><Unlock size={13} /> Unlock</Button>
        </div>
      )}

      {/* Checklist */}
      <Card className="divide-y divide-border/70">
        {areas.map((area) => {
          const st = state[area.id] ?? { done: false, doneAt: null, comment: null };
          return (
            <div key={area.id} className="flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => toggle(area)} disabled={signed}
                aria-pressed={st.done} aria-label={`Mark ${area.name} ${st.done ? "not done" : "done"}`}
                className={cn(
                  "h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors",
                  st.done ? "bg-success border-success text-white" : "border-border-strong text-transparent hover:border-fg-subtle",
                  signed && "opacity-60 cursor-not-allowed"
                )}>
                <Check size={16} strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-medium", st.done && "text-fg")}>{area.name}</div>
                <div className="text-xs text-fg-subtle flex items-center gap-2">
                  {st.done && st.doneAt && <span>done {fmtTime(st.doneAt)}</span>}
                  {st.comment && <span className="inline-flex items-center gap-1 text-fg-muted truncate"><MessageSquare size={10} />{st.comment}</span>}
                </div>
              </div>
              <button type="button" onClick={() => setCommentFor(area)} aria-label="Add comment"
                className={cn("p-1.5 rounded-lg transition-colors", st.comment ? "text-accent" : "text-fg-subtle hover:text-fg hover:bg-bg-muted/60")}>
                <MessageSquare size={15} />
              </button>
            </div>
          );
        })}
      </Card>

      {/* Day note */}
      <div>
        <FieldLabel>Day note (optional)</FieldLabel>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} disabled={signed}
          rows={2} placeholder="Anything to flag — supplies running low, an area skipped and why…" />
      </div>

      {/* Sign off */}
      {!signed && (
        <div className="flex justify-end">
          <Button onClick={() => setSignOpen(true)}><PenLine size={15} /> Sign off day</Button>
        </div>
      )}

      <SignOffDialog open={signOpen} onOpenChange={setSignOpen} people={people}
        defaultPersonId={day.attendancePersonId} onSign={doSign} />

      {commentFor && (
        <CommentDialog key={commentFor.id} area={commentFor} current={state[commentFor.id]?.comment ?? ""}
          onClose={() => setCommentFor(null)} onSave={saveComment} />
      )}
    </div>
  );
}

function SignOffDialog({ open, onOpenChange, people, defaultPersonId, onSign }: {
  open: boolean; onOpenChange: (o: boolean) => void; people: Person[];
  defaultPersonId: number | null; onSign: (name: string, personId: number | null) => void;
}) {
  const [personId, setPersonId] = useState<string>(defaultPersonId != null ? String(defaultPersonId) : "");
  const selected = people.find((p) => String(p.id) === personId);
  return (
    <HrmsDialog open={open} onOpenChange={onOpenChange} title="Sign off the day">
      <div className="space-y-4">
        <p className="text-xs text-fg-muted">Confirm who is signing off. This stamps their name and the time, and locks the day from further edits (you can unlock it later).</p>
        <div>
          <FieldLabel>Signed off by</FieldLabel>
          <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">— Choose person —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!selected} onClick={() => selected && onSign(selected.name, selected.id)}>
            <PenLine size={15} /> Sign off
          </Button>
        </div>
      </div>
    </HrmsDialog>
  );
}

function CommentDialog({ area, current, onClose, onSave }: {
  area: CleaningArea; current: string;
  onClose: () => void; onSave: (area: CleaningArea, comment: string) => void;
}) {
  const [text, setText] = useState(current);
  return (
    <HrmsDialog open onOpenChange={(o) => !o && onClose()} title={`Comment — ${area.name}`}>
      <div className="space-y-4">
        <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3}
          placeholder="e.g. Kitchen sink blocked; boardroom skipped — meeting in progress" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(area, text)}>Save comment</Button>
        </div>
      </div>
    </HrmsDialog>
  );
}
