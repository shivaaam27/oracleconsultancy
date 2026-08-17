"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquare, Lock, Unlock, PenLine, Loader2, X } from "lucide-react";
import { Card, Button, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/cn";
import { completion, dayStatus, dayStatusColor, type CleaningArea, type CleaningCheck, type CleaningDay } from "@/lib/cleaning-shared";
import {
  portalCleaningToggle, portalCleaningComment, portalCleaningNote, portalCleaningSign, portalCleaningUnlock,
} from "@/app/portal/(app)/cleaning/actions";

type CheckState = { done: boolean; doneAt: Date | null; comment: string | null };

const fmtLongDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const fmtTime = (d: Date | null) => (d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

function Ring({ pct, done, total }: { pct: number; done: number; total: number }) {
  const r = 28, c = 2 * Math.PI * r;
  const tone = pct >= 100 ? "var(--color-success)" : pct > 0 ? "var(--color-warn)" : "var(--color-border-strong)";
  return (
    <div className="relative h-[74px] w-[74px] shrink-0">
      <svg width="74" height="74" className="-rotate-90">
        <circle cx="37" cy="37" r={r} fill="none" stroke="var(--color-border)" strokeWidth="6" />
        <circle cx="37" cy="37" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} style={{ transition: "stroke-dashoffset .3s" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-semibold tabular leading-none">{done}/{total}</span>
        <span className="text-[9px] text-fg-subtle">rooms</span>
      </div>
    </div>
  );
}

/** The receptionist's daily cleaning log — tick each room, add a per-room comment,
 *  then Submit the day (which marks her attendance). Portal-styled twin of the admin
 *  CleaningToday: no "who cleaned" picker (she is the cleaner), inline comment editors. */
export function PortalCleaning({
  dateIso, day, areas, checks,
}: {
  dateIso: string;
  day: CleaningDay;
  areas: CleaningArea[];
  checks: CleaningCheck[];
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
  const [openComment, setOpenComment] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const signed = !!day.signedAt;
  const doneN = areas.filter((a) => state[a.id]?.done).length;
  const comp = completion(doneN, areas.length);
  const status = dayStatus(day, doneN, areas.length);

  function toggle(area: CleaningArea) {
    if (signed) { toast("Day is submitted — reopen to make changes.", { tone: "warn" }); return; }
    const next = !state[area.id]?.done;
    setState((s) => ({ ...s, [area.id]: { ...s[area.id], done: next, doneAt: next ? new Date() : null } }));
    start(async () => {
      const res = await portalCleaningToggle(day.id, area.id, next);
      if (!res.ok) { toast(res.error, { tone: "warn" }); setState(initial); }
    });
  }

  function saveComment(area: CleaningArea, comment: string) {
    setState((s) => ({ ...s, [area.id]: { ...s[area.id], comment: comment.trim() || null } }));
    setOpenComment(null);
    start(async () => {
      const res = await portalCleaningComment(day.id, area.id, comment);
      if (!res.ok) toast(res.error, { tone: "warn" });
    });
  }

  function saveNote() {
    if (note === (day.note ?? "")) return;
    start(async () => {
      const res = await portalCleaningNote(day.id, note);
      if (!res.ok) toast(res.error, { tone: "warn" });
    });
  }

  function submitDay() {
    setBusy(true);
    start(async () => {
      const res = await portalCleaningSign(day.id);
      setBusy(false);
      if (!res.ok) { toast(res.error, { tone: "warn" }); return; }
      toast("Cleaning submitted — you’re marked present for today.", { tone: "success" });
      router.refresh();
    });
  }
  function reopen() {
    setBusy(true);
    start(async () => {
      const res = await portalCleaningUnlock(day.id);
      setBusy(false);
      if (!res.ok) { toast(res.error, { tone: "warn" }); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <Reveal delay={0}>
        <Card className="flex items-center gap-4 p-4">
          <Ring pct={comp.pct} done={comp.done} total={comp.total} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{fmtLongDate(dateIso)}</div>
            <span className={cn("mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", dayStatusColor[status])}>{status}</span>
            <p className="mt-1.5 text-[11px] text-fg-subtle">
              {signed ? "Submitted for today." : "Tick each room as you finish it, then submit."}
            </p>
          </div>
        </Card>
      </Reveal>

      {signed && (
        <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success-soft/60 px-4 py-2.5 text-sm">
          <Lock size={15} className="shrink-0 text-success" />
          <span className="flex-1">Submitted{day.signedByName ? ` by ${day.signedByName}` : ""}{day.signedAt ? ` at ${fmtTime(day.signedAt)}` : ""}.</span>
          <Button size="xs" variant="ghost" onClick={reopen} disabled={busy}><Unlock size={13} /> Reopen</Button>
        </div>
      )}

      {/* Checklist */}
      <Reveal delay={0.04}>
        <Card className="divide-y divide-border/70">
          {areas.map((area) => {
            const st = state[area.id] ?? { done: false, doneAt: null, comment: null };
            const editing = openComment === area.id;
            return (
              <div key={area.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => toggle(area)} disabled={signed}
                    aria-pressed={st.done} aria-label={`Mark ${area.name} ${st.done ? "not done" : "done"}`}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      st.done ? "border-success bg-success text-white" : "border-border-strong text-transparent hover:border-fg-subtle",
                      signed && "cursor-not-allowed opacity-60",
                    )}>
                    <Check size={17} strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{area.name}</div>
                    <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
                      {st.done && st.doneAt && <span>done {fmtTime(st.doneAt)}</span>}
                      {st.comment && !editing && <span className="inline-flex items-center gap-1 truncate text-fg-muted"><MessageSquare size={10} />{st.comment}</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => setOpenComment(editing ? null : area.id)} aria-label="Add a comment"
                    className={cn("rounded-lg p-2 transition-colors", st.comment ? "text-accent" : "text-fg-subtle hover:bg-bg-muted/60 hover:text-fg")}>
                    {editing ? <X size={16} /> : <MessageSquare size={16} />}
                  </button>
                </div>
                {editing && (
                  <InlineComment initial={st.comment ?? ""} onSave={(c) => saveComment(area, c)} onCancel={() => setOpenComment(null)} />
                )}
              </div>
            );
          })}
        </Card>
      </Reveal>

      {/* Day note */}
      <Reveal delay={0.06}>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Note for today (optional)</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} disabled={signed}
            rows={2} placeholder="Anything to flag — supplies running low, a room skipped and why…" />
        </div>
      </Reveal>

      {/* Submit */}
      {!signed && (
        <Reveal delay={0.08}>
          <Button className="w-full justify-center" onClick={submitDay} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />} Submit today’s cleaning
          </Button>
        </Reveal>
      )}
    </div>
  );
}

function InlineComment({ initial, onSave, onCancel }: { initial: string; onSave: (c: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="mt-2.5 pl-11">
      <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="e.g. Kitchen sink blocked; boardroom skipped — meeting in progress" />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={() => onSave(text)}>Save comment</Button>
      </div>
    </div>
  );
}
