"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { czDate } from "@/lib/cocozuri-shared";
import {
  CZ_EVENT_LABEL, CZ_SUBJECT_LABEL, darTime, eventTone, groupByDay, subjectHref,
  type CzEvent, type CzSubjectType,
} from "@/lib/cocozuri-events-shared";

/* ------------------------------------------------------------------ *
 * What happened, and when.
 *
 * ⚠️ NOTHING IN THIS MODULE COULD ANSWER "WHAT HAPPENED ON THE 12TH". The stock
 * ledger knows quantities moved and the general ledger knows money moved;
 * neither knows that somebody cancelled an invoice on Tuesday or abandoned a
 * batch at four o'clock.
 * ------------------------------------------------------------------ */

export function CocozuriHistory({
  events, from, to,
}: {
  events: CzEvent[];
  from: string;
  to: string;
}) {
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState<CzSubjectType | "">("");

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return events
      .filter((e) => (subject ? e.subjectType === subject : true))
      .filter((e) => !term
        || e.summary.toLowerCase().includes(term)
        || (e.subjectRef ?? "").toLowerCase().includes(term)
        || e.by.toLowerCase().includes(term));
  }, [events, q, subject]);

  const days = useMemo(() => groupByDay(shown), [shown]);

  // Which kinds of thing actually appear, so the filter offers only real ones.
  const subjects = useMemo(
    () => [...new Set(events.map((e) => e.subjectType))].sort(),
    [events],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">From</span>
          <input type="date" defaultValue={from} className={FIELD}
            onChange={(e) => { window.location.href = `/cocozuri/history?from=${e.target.value}&to=${to}`; }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">To</span>
          <input type="date" defaultValue={to} className={FIELD}
            onChange={(e) => { window.location.href = `/cocozuri/history?from=${from}&to=${e.target.value}`; }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">What sort</span>
          <FluidSelect value={subject} onSelect={(v) => setSubject(v as CzSubjectType | "")}
            options={[
              { value: "", label: "Everything" },
              ...subjects.map((s) => ({ value: s, label: CZ_SUBJECT_LABEL[s] })),
            ]} />
        </label>
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Reference, words, who…" wrapperClassName="w-[16rem]" className="text-sm" />
        <span className="grow" />
        <CocozuriHelp title="What happened">
          <p>
            Everything the module records: what was created, issued, approved, closed, cancelled or
            deleted — and every note anybody wrote.
          </p>
          <p>
            <strong>Nothing here can be changed or removed.</strong> That is the point of it: a
            record of what happened that could be quietly rewritten would not be a record at all.
          </p>
          <p>
            A deleted record still appears, by its reference. The reference is kept on the event
            itself rather than looked up, so the entry goes on reading after the thing it describes
            is gone.
          </p>
          <p>
            Days are Dar es Salaam days. Something at 1am belongs to that morning, not to the day
            before.
          </p>
        </CocozuriHelp>
      </div>

      {days.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-bg-elev py-12 text-center">
          <History size={20} className="text-fg-subtle" />
          <p className="text-base font-medium text-fg-muted">Nothing happened in that time.</p>
          <p className="max-w-[32rem] text-sm text-fg-subtle">
            Only what has happened since this was switched on is here — it does not reach back over
            work that was done before.
          </p>
        </div>
      ) : (
        days.map(({ day, events: list }) => (
          <div key={day} className="overflow-hidden rounded-lg border border-border bg-bg-elev">
            <div className="flex items-baseline justify-between border-b border-border bg-bg-subtle px-3 py-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
                {czDate(day)}
              </span>
              <span className="text-xs text-fg-subtle">
                {list.length} thing{list.length === 1 ? "" : "s"}
              </span>
            </div>
            <ol className="divide-y divide-border">
              {list.map((e) => {
                const tone = eventTone(e.kind);
                const href = subjectHref(e);
                return (
                  <li key={e.id} className="grid grid-cols-[52px_110px_minmax(0,1fr)_100px] items-start gap-2 px-3 py-1.5">
                    <span className="text-xs tabular text-fg-subtle">{darTime(e.at)}</span>
                    <span className="min-w-0 truncate text-xs">
                      {/* ⚠️ The reference is on the EVENT, so a deleted record
                          still reads. It is only a link while it exists. */}
                      {href && e.subjectId != null ? (
                        <Link href={href} className="text-accent hover:underline">
                          {e.subjectRef ?? CZ_SUBJECT_LABEL[e.subjectType]}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">
                          {e.subjectRef ?? CZ_SUBJECT_LABEL[e.subjectType]}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className={`text-xs font-medium uppercase tracking-[0.06em] ${
                        tone === "undo" ? "text-warn" : tone === "note" ? "text-accent" : "text-fg-subtle"}`}>
                        {CZ_EVENT_LABEL[e.kind]}
                      </span>
                      <span className="ml-1.5 whitespace-pre-wrap text-sm text-fg">{e.summary}</span>
                    </span>
                    <span className="truncate text-right text-xs text-fg-subtle" title={e.by}>{e.by}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))
      )}
    </div>
  );
}
