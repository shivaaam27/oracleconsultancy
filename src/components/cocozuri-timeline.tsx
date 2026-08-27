"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, MessageSquare, Send } from "lucide-react";
import { FIELD } from "@/components/ui";
import { useToast } from "@/components/toast";
import { czDate } from "@/lib/cocozuri-shared";
import {
  CZ_EVENT_LABEL, commentBlockers, darDay, darTime, eventTone,
  type CzEvent, type CzSubjectType,
} from "@/lib/cocozuri-events-shared";
import { addCommentAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * What happened to this record, and a place to say something about it.
 *
 * ⚠️ A NOTE IS AN EVENT, in the same stream and the same order as everything
 * else. Two lists would have to be merged and kept in date order on every screen
 * that showed them.
 *
 * ⚠️ AND NOTHING HERE CAN BE EDITED OR DELETED. Events are append-only, the same
 * rule the general ledger follows — a record of what happened that can be
 * quietly rewritten is not a record of anything. Which is why an empty note is
 * refused rather than left to be tidied up later.
 * ------------------------------------------------------------------ */

export function CocozuriTimeline({
  subjectType, subjectId, subjectRef, events, title,
}: {
  subjectType: CzSubjectType;
  subjectId: number;
  subjectRef: string | null;
  events: CzEvent[];
  title?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const blockers = body.trim() ? commentBlockers(body) : [];

  async function send() {
    setBusy(true);
    const res = await addCommentAction(subjectType, subjectId, subjectRef, body);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not save.", { tone: "danger" }); return; }
    setBody("");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-bg-elev print:hidden">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-bg-subtle px-3 py-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
          {title ?? "What happened"}
        </span>
        <span className="text-xs text-fg-subtle">
          Oldest first. Nothing here can be changed or removed afterwards.
        </span>
      </div>

      {events.length === 0 ? (
        <p className="px-3 py-4 text-sm text-fg-subtle">
          Nothing has been recorded against this yet. Anything that happens from now on appears
          here, and you can add a note below.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {events.map((e) => {
            const tone = eventTone(e.kind);
            return (
              <li key={e.id} className="grid grid-cols-[92px_minmax(0,1fr)_110px] items-start gap-2 px-3 py-2">
                <span className="text-xs tabular text-fg-subtle" title={e.at}>
                  {czDate(darDay(e.at))}
                  <span className="ml-1 text-fg-subtle/70">{darTime(e.at)}</span>
                </span>
                <span className="min-w-0">
                  {/* ⚠️ Three tones, not twelve. A screen where everything is
                      coloured is one where nothing stands out. */}
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
      )}

      <div className="space-y-2 border-t border-border bg-bg-subtle px-3 py-2.5">
        <label className="flex items-start gap-2">
          <MessageSquare size={14} className="mt-2 shrink-0 text-fg-subtle" />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Add a note — it stays with this record"
            aria-label="Add a note"
            className={`${FIELD} h-auto resize-y py-1.5`}
          />
        </label>
        {blockers.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void send()} disabled={busy || !body.trim() || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Add the note
          </button>
          {/* ⚠️ Said before it is written, because it cannot be taken back. */}
          <span className="text-xs text-fg-subtle">A note cannot be edited or removed afterwards.</span>
        </div>
      </div>
    </section>
  );
}
