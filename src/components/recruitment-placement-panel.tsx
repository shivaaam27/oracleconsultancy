"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The first month — the placement, the guarantee clock, and the six
// conversations it owes.
//
// ⚠️ THE TWO DATES ARE NOT THE SAME DATE. The fee is earned when the offer is
// ACCEPTED; the guarantee and the check-ins run from the day the person STARTS.
// An accepted offer can sit in the client's permit process for weeks, so this
// panel keeps them apart on screen as firmly as the schema does.
//
// A check-in is written down or it did not happen: the outstanding ones are the
// ABSENCE of a record, not empty rows sitting there looking like work.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CalendarCheck, AlertTriangle, ShieldCheck, ShieldAlert, Undo2, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect } from "./fluid-select";
import {
  expectedCheckIns, checkInTally, guaranteeState, guaranteeDaysLeft,
  remedyFor, FAULTS, FAULT_LABELS, fmtDate, guaranteeEnds,
} from "@/lib/recruitment-shared";
import { usd, tzsFull, feeFor } from "@/lib/recruitment-money";
import {
  recordStartAction, recordEndAction, clearEndAction, recordCheckInAction,
  updatePlacementAction, deletePlacementAction, deleteCheckInAction,
} from "@/app/recruitment/actions";

export type CheckInRow = { id: number; day: number; party: string; spokeOn: string; note: string };

export type PlacementRow = {
  id: number;
  candidateId: number;
  candidateName: string;
  acceptedOn: string;
  startedOn: string | null;
  monthlyGrossUsd: string | null;
  endedOn: string | null;
  endedReason: string | null;
  fault: string | null;
  notes: string | null;
  checkIns: CheckInRow[];
};

export function PlacementPanel({
  orderRef, placements, internal,
}: {
  orderRef: string;
  placements: PlacementRow[];
  /** Oracle's own hiring — no fee and no guarantee. */
  internal: boolean;
}) {
  if (placements.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-fg-subtle">
        Nobody has accepted yet. When they do, record it on the Shortlist tab — that is the moment
        the fee is earned.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {placements.map((p) => (
        <PlacementCard key={p.id} orderRef={orderRef} placement={p} internal={internal} />
      ))}
    </div>
  );
}

function PlacementCard({ orderRef, placement: p, internal }: {
  orderRef: string; placement: PlacementRow; internal: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const state = guaranteeState(p.startedOn, p.endedOn);
  const daysLeft = guaranteeDaysLeft(p.startedOn);
  const expected = expectedCheckIns(p.startedOn, p.checkIns);
  const tally = checkInTally(expected);
  const fee = internal ? null : feeFor(p.monthlyGrossUsd);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Couldn't save.");
      else { setError(null); setStarting(false); setEnding(false); router.refresh(); }
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-subtle px-3 py-2">
        <Link href={`/recruitment/candidates/${p.candidateId}`} className="text-[13px] font-medium hover:text-accent">
          {p.candidateName}
        </Link>
        <GuaranteeBadge state={state} daysLeft={daysLeft} />
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-3 py-3 sm:grid-cols-2">
        <Field label="Offer accepted" value={fmtDate(p.acceptedOn) ?? "—"} hint={internal ? undefined : "The fee is earned on this date."} />
        <Field
          label="Started"
          value={p.startedOn ? (fmtDate(p.startedOn) ?? "—") : "Not yet"}
          hint={p.startedOn ? "The guarantee and the check-ins run from here." : "Waiting on the client's permit process."}
        />
        {fee && <Field label="Gross at acceptance" value={usd(fee.grossUSD)} hint="Frozen — editing the role later does not move it." />}
        {fee && <Field label="Fee" value={tzsFull(fee.netTZS)} />}
        {p.startedOn && !p.endedOn && (
          <Field label="Guarantee ends" value={fmtDate(guaranteeEnds(p.startedOn.slice(0, 10))) ?? "—"} />
        )}
        {p.notes && <Field label="Notes" value={p.notes} />}
      </div>

      {/* ⚠️ The gross is FROZEN against edits to the job order — not against the
          owner noticing he typed 1,500 for 1,550. Everything typed here can be
          corrected here. */}
      {correcting && (
        <CorrectBox
          placement={p}
          pending={pending}
          onCancel={() => setCorrecting(false)}
          onSubmit={(patch) => run(async () => {
            const r = await updatePlacementAction(p.id, patch, orderRef);
            if (r.ok) setCorrecting(false);
            return r;
          })}
        />
      )}

      {p.endedOn && (
        <div className="border-t border-border bg-danger-soft/30 px-3 py-2.5">
          <p className="flex items-start gap-1.5 text-[12px]">
            <ShieldAlert size={13} className="mt-0.5 shrink-0 text-danger" />
            <span>
              <strong>Ended {fmtDate(p.endedOn)}</strong> — {p.endedReason}
              {p.fault && <> · {FAULT_LABELS[p.fault as keyof typeof FAULT_LABELS] ?? p.fault}&rsquo;s fault.</>}
            </span>
          </p>
          <p className="mt-1.5 text-[11px] text-fg-muted">{remedyFor(p.fault)}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => clearEndAction(p.id, orderRef))}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg"
          >
            <Undo2 size={11} /> Recorded by mistake — undo
          </button>
        </div>
      )}

      {/* The first month. */}
      {p.startedOn ? (
        <div className="border-t border-border px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">The first month</span>
            <span className="text-[11px] text-fg-muted">
              {tally.done} of 6 written down
              {tally.overdue > 0 && <span className="ml-1 font-medium text-warn">· {tally.overdue} overdue</span>}
            </span>
          </div>
          <div className="space-y-1.5">
            {expected.map((e) => {
              const recorded = p.checkIns.find((c) => c.day === e.day && c.party === e.party);
              return (
                <CheckInRowView
                  key={`${e.day}-${e.party}`}
                  orderRef={orderRef}
                  placementId={p.id}
                  day={e.day}
                  party={e.party}
                  dueOn={e.dueOn}
                  overdue={e.overdue}
                  recorded={recorded}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border-t border-border px-3 py-3">
          <p className="text-[12px] text-fg-muted">
            The day 7, 14 and 30 conversations begin once they start. Nothing is owed yet.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        {!p.startedOn && (
          <button
            type="button"
            onClick={() => setStarting((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg"
          >
            <CalendarCheck size={12} /> They started
          </button>
        )}
        {p.startedOn && !p.endedOn && (
          <button
            type="button"
            onClick={() => setEnding((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:bg-bg-muted"
          >
            <ShieldAlert size={12} /> It went wrong
          </button>
        )}
        <button
          type="button"
          onClick={() => setCorrecting((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:bg-bg-muted"
        >
          <Pencil size={12} /> Correct the details
        </button>
        <DeletePlacement placementId={p.id} orderRef={orderRef} onRun={run} pending={pending} />
      </div>

      {starting && (
        <DateBox
          label="What day did they start?"
          cta="Record the start"
          pending={pending}
          onCancel={() => setStarting(false)}
          onSubmit={(d) => run(() => recordStartAction(p.id, d, orderRef))}
        />
      )}

      {ending && (
        <EndBox pending={pending} onCancel={() => setEnding(false)}
          onSubmit={(d, reason, fault) => run(() => recordEndAction(p.id, d, reason, fault, orderRef))} />
      )}

      {error && (
        <p role="alert" className="border-t border-danger/30 bg-danger-soft px-3 py-1.5 text-[11px] text-danger">{error}</p>
      )}
    </div>
  );
}

function GuaranteeBadge({ state, daysLeft }: { state: string; daysLeft: number | null }) {
  if (state === "notStarted") {
    return <span className="ml-auto rounded-sm bg-bg-muted px-1.5 py-0.5 text-[11px] text-fg-muted">Not started</span>;
  }
  if (state === "failed") {
    return <span className="ml-auto inline-flex items-center gap-1 rounded-sm bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger"><ShieldAlert size={11} /> Failed</span>;
  }
  if (state === "lapsed") {
    return <span className="ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium text-success"><ShieldCheck size={11} /> Guarantee ran clean</span>;
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1 rounded-sm bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
      <ShieldCheck size={11} /> Guarantee live{daysLeft != null && ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
    </span>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">{label}</p>
      <p className="text-[13px]">{value}</p>
      {hint && <p className="text-[11px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── one check-in ─── */

function CheckInRowView({
  orderRef, placementId, day, party, dueOn, overdue, recorded,
}: {
  orderRef: string;
  placementId: number;
  day: number;
  party: string;
  dueOn: string;
  overdue: boolean;
  recorded?: CheckInRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(recorded?.note ?? "");
  const [when, setWhen] = useState(recorded?.spokeOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={cn("rounded-md border px-2 py-1.5", recorded ? "border-border bg-bg-subtle/50" : overdue ? "border-warn/40 bg-warn-soft/30" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium">Day {day}</span>
        <span className="text-[11px] text-fg-muted">{party === "client" ? "the client" : "the candidate"}</span>
        <span className="text-[11px] text-fg-subtle">due {fmtDate(dueOn)}</span>
        {recorded ? (
          <span className="text-[11px] text-success">✓ {fmtDate(recorded.spokeOn)}</span>
        ) : overdue ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warn"><AlertTriangle size={10} /> overdue</span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent-soft"
        >
          {recorded ? "Edit" : "Write it down"}
        </button>
      </div>

      {recorded && !open && <p className="mt-1 text-[11px] text-fg-muted">{recorded.note}</p>}

      {open && (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            autoFocus
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={party === "client" ? "What did the client say about how it is going?" : "What did the candidate say?"}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] outline-none placeholder:text-fg-subtle focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="h-7 rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await recordCheckInAction(placementId, day, party, when, note, orderRef);
                  if (!res.ok) setError(res.error ?? "Couldn't save it.");
                  else { setOpen(false); router.refresh(); }
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg disabled:opacity-60"
            >
              {pending && <Loader2 size={11} className="animate-spin" />} Save
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-fg-subtle hover:text-fg">Cancel</button>
            {recorded && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const res = await deleteCheckInAction(recorded.id, orderRef);
                    if (!res.ok) setError(res.error ?? "Couldn't remove it.");
                    else { setOpen(false); router.refresh(); }
                  });
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-fg-subtle hover:bg-bg-muted hover:text-danger"
                title="Recorded against the wrong day or the wrong side"
              >
                <Trash2 size={11} /> Remove
              </button>
            )}
          </div>
          {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────── little forms ──── */

/**
 * Correcting a placement. Everything typed at acceptance can be re-typed: the
 * dates, the gross the fee was worked out from, and a note.
 */
function CorrectBox({ placement: p, pending, onCancel, onSubmit }: {
  placement: PlacementRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (patch: { acceptedOn: string; startedOn: string | null; monthlyGrossUsd: string; notes: string }) => void;
}) {
  const [accepted, setAccepted] = useState(p.acceptedOn.slice(0, 10));
  const [started, setStarted] = useState(p.startedOn ? p.startedOn.slice(0, 10) : "");
  const [gross, setGross] = useState(p.monthlyGrossUsd ?? "");
  const [notes, setNotes] = useState(p.notes ?? "");
  const box = "h-7 rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent";

  return (
    <div className="space-y-2 border-t border-border bg-bg-subtle px-3 py-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-fg-subtle">Offer accepted</span>
          <input type="date" value={accepted} onChange={(e) => setAccepted(e.target.value)} className={box + " w-full"} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-fg-subtle">Started</span>
          <input type="date" value={started} onChange={(e) => setStarted(e.target.value)} className={box + " w-full"} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-fg-subtle">Monthly gross (USD)</span>
          <input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} className={box + " tabular w-full"} />
        </label>
      </div>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything worth remembering about this placement."
        className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] outline-none placeholder:text-fg-subtle focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onSubmit({ acceptedOn: accepted, startedOn: started || null, monthlyGrossUsd: gross, notes })}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg disabled:opacity-60"
        >
          {pending && <Loader2 size={11} className="animate-spin" />} Save the correction
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-fg-subtle hover:text-fg">Cancel</button>
      </div>
    </div>
  );
}

/** Removing a placement recorded in error. Asks twice, because its check-ins go
 *  with it and they are the evidence trail for that first month. */
function DeletePlacement({ placementId, orderRef, onRun, pending }: {
  placementId: number;
  orderRef: string;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-fg-subtle hover:bg-bg-muted hover:text-danger"
      >
        <Trash2 size={11} /> Delete
      </button>
    );
  }
  return (
    <span className="ml-auto inline-flex items-center gap-2 text-[11px]">
      <span className="text-fg-muted">Delete this placement and its check-ins?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => onRun(() => deletePlacementAction(placementId, orderRef))}
        className="rounded-md bg-danger px-2 py-1 font-medium text-white disabled:opacity-60"
      >
        Yes
      </button>
      <button type="button" onClick={() => setArmed(false)} className="inline-flex items-center gap-1 text-fg-subtle hover:text-fg">
        <X size={11} /> No
      </button>
    </span>
  );
}

function DateBox({ label, cta, pending, onCancel, onSubmit }: {
  label: string; cta: string; pending: boolean; onCancel: () => void; onSubmit: (d: string) => void;
}) {
  const [d, setD] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-bg-subtle px-3 py-2">
      <span className="text-[11px] text-fg-muted">{label}</span>
      <input
        type="date"
        value={d}
        onChange={(e) => setD(e.target.value)}
        className="h-7 rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => onSubmit(d)}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg disabled:opacity-60"
      >
        {pending && <Loader2 size={11} className="animate-spin" />} {cta}
      </button>
      <button type="button" onClick={onCancel} className="text-[11px] text-fg-subtle hover:text-fg">Cancel</button>
    </div>
  );
}

function EndBox({ pending, onCancel, onSubmit }: {
  pending: boolean; onCancel: () => void; onSubmit: (d: string, reason: string, fault: string) => void;
}) {
  const [d, setD] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [fault, setFault] = useState("");

  return (
    <div className="space-y-2 border-t border-border bg-bg-subtle px-3 py-2.5">
      <p className="text-[11px] text-fg-muted">
        Whose fault it was decides the remedy, so it is asked plainly.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={d}
          onChange={(e) => setD(e.target.value)}
          className="h-7 rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent"
        />
        <FluidSelect
          value={fault}
          placeholder="Whose fault?"
          options={FAULTS.map((f) => ({ value: f, label: FAULT_LABELS[f] }))}
          buttonClassName="h-7"
          onSelect={setFault}
        />
      </div>
      {fault && <p className="text-[11px] text-fg-muted">{remedyFor(fault)}</p>}
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="What happened, in your words. This is the record it is judged on."
        className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] outline-none placeholder:text-fg-subtle focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !fault || !reason.trim()}
          onClick={() => onSubmit(d, reason, fault)}
          className="inline-flex items-center gap-1.5 rounded-md bg-danger px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
        >
          {pending && <Loader2 size={11} className="animate-spin" />} Record it
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-fg-subtle hover:text-fg">Cancel</button>
      </div>
    </div>
  );
}
