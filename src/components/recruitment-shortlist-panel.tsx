"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The shortlist on a job order — who is being put forward, and WHY.
//
// The "why" is the point. The company profile promises every client "a shortlist
// with written reasoning on each candidate… our reasoning, not just a stack of
// CVs", so the reasoning box is on the row, not hidden behind an edit screen,
// and a candidate with none is called out.
//
// The match score is worked out on the spot from the candidate and the role
// (lib/recruitment-shared). Nothing about it is stored, so it can never go on
// describing a salary that has since been corrected.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, Loader2, CalendarPlus, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect } from "./fluid-select";
import {
  CANDIDATE_STAGES, DECLINE_REASONS, INTERVIEW_KINDS, INTERVIEW_OUTCOMES,
  matchScore, matchTone, seniorityLabel, fmtDate, bothClocks, isLiveOnShortlist,
} from "@/lib/recruitment-shared";
import { usd } from "@/lib/recruitment-money";
import {
  addToShortlistAction, updateShortlistAction, removeFromShortlistAction,
  scheduleInterviewAction, updateInterviewAction, deleteInterviewAction,
  recordAcceptanceAction,
} from "@/app/recruitment/actions";

export type ShortlistRow = {
  id: number;
  candidateId: number;
  stage: string;
  matchNote: string | null;
  declineReason: string | null;
  sentToClientOn: string | null;
  candidateName: string;
  candidateTitle: string | null;
  candidateSector: string | null;
  candidateSeniority: string | null;
  candidateSalaryUsd: string | null;
};

export type InterviewRow = {
  id: number;
  shortlistId: number;
  kind: string;
  scheduledFor: string;
  outcome: string;
  note: string | null;
};

export type PoolCandidate = {
  id: number;
  name: string;
  title: string | null;
  sector: string | null;
  seniority: string | null;
  expectedSalaryUsd: string | null;
};

const TONE_CHIP: Record<string, string> = {
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn",
  muted: "bg-bg-muted text-fg-muted",
};

export function ShortlistPanel({
  orderRef, jobOrderId, order, rows, interviews, pool, hasPlacement,
}: {
  orderRef: string;
  jobOrderId: number;
  order: { title: string; sector: string | null; seniority: string | null; monthlyGrossUsd: string | null };
  rows: ShortlistRow[];
  interviews: InterviewRow[];
  pool: PoolCandidate[];
  /** Somebody has already accepted — the offer buttons come off. */
  hasPlacement: boolean;
}) {
  const [adding, setAdding] = useState(false);

  const byShortlist = useMemo(() => {
    const m = new Map<number, InterviewRow[]>();
    for (const i of interviews) {
      const list = m.get(i.shortlistId) ?? [];
      list.push(i);
      m.set(i.shortlistId, list);
    }
    return m;
  }, [interviews]);

  // Best fit first — the same order a sourcer would read them in.
  const ranked = useMemo(() => {
    const scored = rows.map((r) => ({
      row: r,
      score: matchScore(
        { seniority: r.candidateSeniority, sector: r.candidateSector, title: r.candidateTitle, expectedSalaryUsd: r.candidateSalaryUsd },
        order,
      ).score,
    }));
    return scored.sort((a, b) => {
      // Declined candidates sink, whatever they scored.
      const al = isLiveOnShortlist(a.row.stage) ? 0 : 1;
      const bl = isLiveOnShortlist(b.row.stage) ? 0 : 1;
      return al - bl || b.score - a.score;
    });
  }, [rows, order]);

  const already = new Set(rows.map((r) => r.candidateId));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] text-fg-muted">
          {rows.length === 0 ? "Nobody on the shortlist yet." :
            `${rows.filter((r) => isLiveOnShortlist(r.stage)).length} still in the running of ${rows.length}.`}
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
        >
          <Plus size={14} /> Add a candidate
        </button>
      </div>

      {adding && (
        <AddCandidate
          orderRef={orderRef}
          jobOrderId={jobOrderId}
          order={order}
          pool={pool.filter((c) => !already.has(c.id))}
          onDone={() => setAdding(false)}
        />
      )}

      {ranked.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-fg-subtle">
          Search the pool and put names forward. Every one of them needs a line of reasoning —
          that is what the client is promised.
        </p>
      ) : (
        <div className="space-y-2">
          {ranked.map(({ row, score }) => (
            <ShortlistCard
              key={row.id}
              orderRef={orderRef}
              row={row}
              score={score}
              interviews={byShortlist.get(row.id) ?? []}
              hasPlacement={hasPlacement}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── one row ─── */

function ShortlistCard({
  orderRef, row, score, interviews, hasPlacement,
}: {
  orderRef: string;
  row: ShortlistRow;
  score: number;
  interviews: InterviewRow[];
  hasPlacement: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(row.matchNote ?? "");
  const [noteDirty, setNoteDirty] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [offering, setOffering] = useState(false);
  const [booking, setBooking] = useState(false);

  const live = isLiveOnShortlist(row.stage);
  const tone = matchTone(score);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Couldn't save.");
      else { setError(null); router.refresh(); }
    });
  };

  return (
    <div className={cn("rounded-lg border border-border bg-bg-elev", !live && "opacity-70")}>
      <div className="flex flex-wrap items-start gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <Link href={`/recruitment/candidates/${row.candidateId}`} className="text-[13px] font-medium hover:text-accent">
            {row.candidateName}
          </Link>
          <p className="truncate text-[11px] text-fg-muted">
            {[row.candidateTitle, row.candidateSector, seniorityLabel(row.candidateSeniority)]
              .filter((x) => x && x !== "—").join(" · ") || "—"}
            {row.candidateSalaryUsd ? ` · asks ${usd(Number(row.candidateSalaryUsd))}` : ""}
          </p>
        </div>

        <span
          className={cn("inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tabular", TONE_CHIP[tone])}
          title="Seniority 35 · sector 25 · title 25 · salary 15. Worked out fresh every time this is read."
        >
          {score}% fit
        </span>

        <FluidSelect
          value={row.stage}
          options={CANDIDATE_STAGES.map((s) => ({ value: s, label: s }))}
          buttonClassName="h-7"
          onSelect={(v: string) => {
            if (v === "Declined") { setDeclining(true); return; }
            run(() => updateShortlistAction(row.id, { stage: v }, orderRef));
          }}
        />
      </div>

      <div className="space-y-2 px-3 py-2.5">
        {/* THE REASONING. Not optional, and not hidden. */}
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-fg-subtle">
            Why they are on the list
          </span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => { setNote(e.target.value); setNoteDirty(true); }}
            placeholder="Ten years on rotary kilns at a comparable plant; ran a 40-person shift team…"
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] outline-none placeholder:text-fg-subtle focus:border-accent"
          />
          {/* Only nagged while they are still in the running: a candidate who has
              been declined is past the point where the reasoning was owed. */}
          {!row.matchNote && !noteDirty && live && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-warn">
              <AlertTriangle size={10} /> Nothing written yet — the client is promised your reasoning.
            </span>
          )}
        </label>

        {noteDirty && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(async () => { const r = await updateShortlistAction(row.id, { matchNote: note }, orderRef); if (r.ok) setNoteDirty(false); return r; })}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg disabled:opacity-60"
          >
            {pending && <Loader2 size={11} className="animate-spin" />} Save the reasoning
          </button>
        )}

        {row.declineReason && (
          <p className="text-[11px] text-fg-muted">
            Declined — <span className="font-medium">{row.declineReason}</span>
          </p>
        )}

        {/* ⚠️ THE DATE THE CHASE LIST COUNTS FROM. Without somewhere to type it,
            "With the client" could never say how long anyone had been waiting —
            which is the one thing that screen is for. */}
        <label className={cn("flex flex-wrap items-center gap-2", !live && "hidden")}>
          <span className="text-[11px] uppercase tracking-[0.04em] text-fg-subtle">Sent to the client</span>
          <input
            type="date"
            value={row.sentToClientOn ? row.sentToClientOn.slice(0, 10) : ""}
            onChange={(e) => run(() => updateShortlistAction(row.id, { sentToClientOn: e.target.value || null }, orderRef))}
            className="h-7 rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent"
          />
          {!row.sentToClientOn && (
            <span className="text-[11px] text-fg-subtle">The wait is counted from this date.</span>
          )}
        </label>

        {/* Interviews for this candidate. */}
        {interviews.length > 0 && (
          <ul className="space-y-1">
            {interviews.map((i) => (
              <InterviewLine key={i.id} interview={i} orderRef={orderRef} onRun={run} />
            ))}
          </ul>
        )}

        {live && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setBooking((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:bg-bg-muted"
            >
              <CalendarPlus size={12} /> Book an interview
            </button>
            {!hasPlacement && (
              <button
                type="button"
                onClick={() => setOffering((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success hover:opacity-90"
              >
                <CheckCircle2 size={12} /> They accepted the offer
              </button>
            )}
            {row.stage === "Sourced" && (
              <button
                type="button"
                onClick={() => run(() => removeFromShortlistAction(row.id, orderRef))}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-subtle hover:bg-bg-muted hover:text-danger"
                title="Only while nobody outside Oracle has seen them"
              >
                <X size={11} /> Remove
              </button>
            )}
          </div>
        )}

        {booking && <BookInterview shortlistId={row.id} orderRef={orderRef} onDone={() => setBooking(false)} />}
        {declining && (
          <DeclineBox
            onCancel={() => setDeclining(false)}
            onDecline={(reason) => run(async () => {
              const r = await updateShortlistAction(row.id, { stage: "Declined", declineReason: reason }, orderRef);
              if (r.ok) setDeclining(false);
              return r;
            })}
            pending={pending}
          />
        )}
        {offering && (
          <AcceptBox
            onCancel={() => setOffering(false)}
            onAccept={(when) => run(async () => {
              const r = await recordAcceptanceAction(row.id, when, orderRef);
              if (r.ok) setOffering(false);
              return r;
            })}
            pending={pending}
          />
        )}

        {error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2 py-1 text-[11px] text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── little forms ── */

/**
 * One interview, all of it editable in place — the kind, the time and the
 * outcome, plus a way to remove one booked by mistake. An interview that can
 * only be given an outcome is an interview you cannot move, and rearranging
 * across the time difference is most of the job.
 */
function InterviewLine({ interview: i, orderRef, onRun }: {
  interview: InterviewRow;
  orderRef: string;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(localInput(i.scheduledFor));
  const [kind, setKind] = useState(i.kind);
  const [note, setNote] = useState(i.note ?? "");

  return (
    <li className="rounded-md bg-bg-subtle px-2 py-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{i.kind}</span>
        <span className="text-fg-muted">{fmtDate(i.scheduledFor)} · {bothClocks(i.scheduledFor)}</span>
        <FluidSelect
          value={i.outcome}
          options={INTERVIEW_OUTCOMES.map((o) => ({ value: o, label: o }))}
          buttonClassName="h-6 ml-auto"
          onSelect={(v: string) => onRun(() => updateInterviewAction(i.id, { outcome: v }, orderRef))}
        />
        <button type="button" onClick={() => setEditing((v) => !v)} className="rounded px-1 text-accent hover:bg-accent-soft">
          {editing ? "Close" : "Change"}
        </button>
      </div>

      {i.note && !editing && <p className="mt-1 text-fg-muted">{i.note}</p>}

      {editing && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <FluidSelect
              value={kind}
              options={INTERVIEW_KINDS.map((k) => ({ value: k, label: k }))}
              buttonClassName="h-7"
              onSelect={setKind}
            />
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="h-7 rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent"
            />
          </div>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What came out of it, or anything the client asked for."
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] outline-none placeholder:text-fg-subtle focus:border-accent"
          />
          {when && <p className="text-fg-muted">{bothClocks(new Date(when).toISOString())}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onRun(async () => {
                const r = await updateInterviewAction(i.id, { kind, scheduledFor: when, note }, orderRef);
                if (r.ok) setEditing(false);
                return r;
              })}
              className="rounded-md bg-accent px-2.5 py-1 font-medium text-accent-fg"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => onRun(() => deleteInterviewAction(i.id, orderRef))}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-fg-subtle hover:bg-bg-muted hover:text-danger"
            >
              <X size={11} /> Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** An ISO instant as `<input type="datetime-local">` wants it — LOCAL wall clock,
 *  which for this owner is Dar es Salaam. Slicing the ISO string instead would
 *  put UTC in the box and move every interview back three hours on save. */
function localInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DeclineBox({ onCancel, onDecline, pending }: {
  onCancel: () => void; onDecline: (reason: string) => void; pending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-2.5">
      <p className="mb-1.5 text-[11px] text-fg-muted">
        Why? The wording matters — these are the fault buckets the Terms of Business use.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <FluidSelect
          value={reason}
          placeholder="Choose a reason…"
          options={DECLINE_REASONS.map((r) => ({ value: r, label: r }))}
          buttonClassName="h-7"
          onSelect={setReason}
        />
        <button
          type="button"
          disabled={!reason || pending}
          onClick={() => onDecline(reason)}
          className="inline-flex items-center gap-1.5 rounded-md bg-danger px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
        >
          {pending && <Loader2 size={11} className="animate-spin" />} Decline
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-fg-subtle hover:text-fg">Cancel</button>
      </div>
    </div>
  );
}

function AcceptBox({ onCancel, onAccept, pending }: {
  onCancel: () => void; onAccept: (when: string) => void; pending: boolean;
}) {
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="rounded-md border border-success/40 bg-success-soft/40 p-2.5">
      <p className="mb-1.5 flex items-start gap-1.5 text-[11px] text-fg">
        <Info size={12} className="mt-0.5 shrink-0 text-success" />
        <span>
          <strong>The fee is earned on this date.</strong> Everyone else still on the shortlist is
          declined as &ldquo;client chose another candidate&rdquo;, and the role moves to Offer accepted.
        </span>
      </p>
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
          onClick={() => onAccept(when)}
          className="inline-flex items-center gap-1.5 rounded-md bg-success px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-60"
        >
          {pending && <Loader2 size={11} className="animate-spin" />} Record the acceptance
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-fg-subtle hover:text-fg">Cancel</button>
      </div>
    </div>
  );
}

function BookInterview({ shortlistId, orderRef, onDone }: {
  shortlistId: number; orderRef: string; onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("Client interview");
  const [when, setWhen] = useState("");

  return (
    <div className="rounded-md border border-border bg-bg-subtle p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <FluidSelect
          value={kind}
          options={INTERVIEW_KINDS.map((k) => ({ value: k, label: k }))}
          buttonClassName="h-7"
          onSelect={setKind}
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="h-7 rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={pending || !when}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await scheduleInterviewAction(shortlistId, kind, when, orderRef);
              if (!res.ok) setError(res.error ?? "Couldn't book it.");
              else { onDone(); router.refresh(); }
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg disabled:opacity-60"
        >
          {pending && <Loader2 size={11} className="animate-spin" />} Book it
        </button>
        <button type="button" onClick={onDone} className="text-[11px] text-fg-subtle hover:text-fg">Cancel</button>
      </div>
      {when && (
        <p className="mt-1.5 text-[11px] text-fg-muted">
          {bothClocks(new Date(when).toISOString())} — check it suits both ends before you send it.
        </p>
      )}
      {error && <p role="alert" className="mt-1.5 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

/* ────────────────────────────────────────────────────── add from the pool ── */

function AddCandidate({ orderRef, jobOrderId, order, pool, onDone }: {
  orderRef: string;
  jobOrderId: number;
  order: { title: string; sector: string | null; seniority: string | null; monthlyGrossUsd: string | null };
  pool: PoolCandidate[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PoolCandidate | null>(null);
  const [note, setNote] = useState("");

  // The pool, best fit for THIS role first — which is the whole use of a score.
  const suggestions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool
      .map((c) => ({ c, score: matchScore(c, order).score }))
      .filter(({ c }) => !needle || [c.name, c.title, c.sector].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [pool, q, order]);

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3">
      {!picked ? (
        <>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the pool…"
            className="h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent"
          />
          <p className="mt-1.5 text-[11px] text-fg-subtle">Best fit for this role first.</p>
          <ul className="mt-2 space-y-1">
            {suggestions.length === 0 && (
              <li className="py-3 text-center text-[12px] text-fg-subtle">
                {pool.length === 0 ? "Everyone in the pool is already on this shortlist." : "Nobody matches that."}
              </li>
            )}
            {suggestions.map(({ c, score }) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setPicked(c)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">{c.name}</span>
                    <span className="block truncate text-[11px] text-fg-muted">
                      {[c.title, c.sector, seniorityLabel(c.seniority)].filter((x) => x && x !== "—").join(" · ") || "—"}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium tabular", TONE_CHIP[matchTone(score)])}>
                    {score}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onDone} className="mt-2 text-[11px] text-fg-subtle hover:text-fg">Cancel</button>
        </>
      ) : (
        <>
          <p className="text-[13px] font-medium">{picked.name}</p>
          <label className="mt-2 block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.04em] text-fg-subtle">
              Why they are on the list
            </span>
            <textarea
              autoFocus
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What makes them right for this role, in your words. This is what goes to the client."
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] outline-none placeholder:text-fg-subtle focus:border-accent"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await addToShortlistAction(jobOrderId, picked.id, note, orderRef);
                  if (!res.ok) setError(res.error ?? "Couldn't add them.");
                  else { onDone(); router.refresh(); }
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60"
            >
              {pending && <Loader2 size={12} className="animate-spin" />} Add to the shortlist
            </button>
            <button type="button" onClick={() => setPicked(null)} className="text-[11px] text-fg-subtle hover:text-fg">
              Pick somebody else
            </button>
          </div>
          {error && <p role="alert" className="mt-1.5 text-[11px] text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
