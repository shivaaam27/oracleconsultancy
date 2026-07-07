"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, Play, ChevronDown, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui";
import { useToast } from "@/components/toast";
import { toggleAutomationActive, cancelAutomation, testAutomationAction, ruleFiringsAction } from "./actions";

/** Client-safe "3 days ago" for an ISO string (mirrors describe.ts relativeTime,
 *  which is server-only and can't be imported into this client component). */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? "" : "s"} ago`;
}

/** The pause/resume Switch + cancel control for one automation row. Client-only
 *  interactivity; all data is passed down from the server page. Reuses the iPhone
 *  Switch and the shared toast. */
export function AutomationControls({ id, active }: { id: number; active: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [testing, setTesting] = useState(false);

  function onToggle() {
    start(async () => {
      const res = await toggleAutomationActive(id, !active);
      if (!res.ok) toast(res.error ?? "Could not update.", { tone: "danger" });
      else router.refresh();
    });
  }

  function onTest() {
    setTesting(true);
    (async () => {
      const res = await testAutomationAction(id);
      if (!res.ok) toast(res.error ?? "Could not run the test.", { tone: "danger" });
      else if (res.fired > 0) toast("Fired — check your notifications.", { tone: "success" });
      else toast("Nothing was due, so nothing fired.", { tone: "default" });
      setTesting(false);
      router.refresh();
    })();
  }

  function onCancel() {
    start(async () => {
      const res = await cancelAutomation(id);
      if (!res.ok) toast(res.error ?? "Could not cancel.", { tone: "danger" });
      else {
        toast("Automation cancelled.", { tone: "success" });
        router.refresh();
      }
      setConfirming(false);
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-fg-muted">Cancel it?</span>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-2.5 py-1 text-[11px] font-medium ring-1 bg-danger/12 text-danger ring-danger/30 hover:bg-danger/20 disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : "Yes, cancel"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg px-2.5 py-1 text-[11px] font-medium ring-1 ring-border/60 text-fg-muted hover:bg-bg-subtle disabled:opacity-60"
        >
          Keep
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onTest}
        disabled={testing}
        aria-label="Test this automation now"
        title="Test now"
        className="grid h-7 w-7 place-items-center rounded-lg text-fg-subtle ring-1 ring-border/60 hover:bg-accent/10 hover:text-accent hover:ring-accent/30 disabled:opacity-60"
      >
        {testing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        role="switch"
        aria-checked={active}
        aria-label={active ? "Pause automation" : "Resume automation"}
        className="inline-flex items-center gap-1.5 disabled:opacity-60"
      >
        <Switch on={active} busy={busy} size="sm" />
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy}
        aria-label="Cancel automation"
        className="grid h-7 w-7 place-items-center rounded-lg text-fg-subtle ring-1 ring-border/60 hover:bg-danger/10 hover:text-danger hover:ring-danger/30 disabled:opacity-60"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/** A small "last firings" expander. Best-effort — reads recorded cron events for
 *  this rule on demand (only when opened), so it costs nothing on page load and
 *  degrades to a quiet "no recorded firings yet" line if the cron didn't log any. */
export function FiringHistory({ id, lastFired }: { id: number; lastFired: string | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<{ at: string; note: string }[] | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null) {
      setLoading(true);
      ruleFiringsAction(id).then((r) => { setRows(r); setLoading(false); });
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg-muted"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {lastFired ? `Last fired ${lastFired}` : "Not fired yet"}
      </button>
      {open && (
        <div className="mt-1 pl-4">
          {loading ? (
            <span className="text-[11px] text-fg-subtle">Loading…</span>
          ) : rows && rows.length ? (
            <ul className="space-y-0.5">
              {rows.map((r, i) => (
                <li key={i} className="text-[11px] text-fg-muted">
                  <span className="text-fg-subtle">{relTime(r.at)}</span> — {r.note}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[11px] text-fg-subtle">No recorded firings yet.</span>
          )}
        </div>
      )}
    </div>
  );
}
