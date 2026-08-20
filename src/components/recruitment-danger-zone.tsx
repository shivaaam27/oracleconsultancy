"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Danger zone — deleting a record for good.
//
// COS archives rather than deletes, and that stays the normal answer: the button
// at the top of every record is Archive. This is the other one, for the mistake
// you want gone rather than filed — the owner runs this desk himself and should
// not have to ask anybody to clear a typo.
//
// It behaves like the one on the person record: tucked at the foot, states what
// will go, and asks a second time. The database refuses anything that would take
// real history with it, and the message says so in English.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";

export function DangerZone({
  what,
  name,
  alsoGoes,
  onDelete,
  backHref,
}: {
  /** "client", "candidate", "job order" — used in the sentences. */
  what: string;
  name: string;
  /** What else disappears with it, said plainly. Omit when nothing does. */
  alsoGoes?: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
  /** Where to go once it is gone. */
  backHref: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="overflow-hidden rounded-lg border border-danger/30">
      <div className="border-b border-danger/30 bg-danger-soft/40 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-danger">Danger zone</span>
      </div>
      <div className="space-y-2 px-3 py-3">
        {!armed ? (
          <>
            <p className="text-[12px] text-fg-muted">
              Archiving takes this {what} out of the way and keeps every record of it. Deleting
              removes it for good.
            </p>
            <button
              type="button"
              onClick={() => { setArmed(true); setError(null); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger-soft"
            >
              <Trash2 size={12} /> Delete this {what}
            </button>
          </>
        ) : (
          <>
            <p className="flex items-start gap-1.5 text-[12px]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
              <span>
                Delete <strong>{name}</strong> for good?
                {alsoGoes ? ` ${alsoGoes}` : ""} This cannot be undone.
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const res = await onDelete();
                    if (!res.ok) { setError(res.error ?? "Couldn't delete it."); setArmed(false); }
                    else router.push(backHref);
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-danger px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-60"
              >
                {pending && <Loader2 size={11} className="animate-spin" />} Yes, delete it
              </button>
              <button
                type="button"
                onClick={() => setArmed(false)}
                className="text-[11px] text-fg-subtle hover:text-fg"
              >
                Keep it
              </button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2 py-1.5 text-[11px] text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
