"use client";

import { useState, useTransition } from "react";
import { RefreshCcw, Check, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";

/**
 * Admin button: hits /api/admin/resync-latest-update to re-derive every task's
 * latest_update mirror from task_updates. Cheap, idempotent, safe to re-run.
 */
export function ResyncLatestUpdateButton() {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const run = () => {
    start(async () => {
      try {
        const res = await fetch("/api/admin/resync-latest-update", { method: "POST" });
        const j = await res.json();
        if (!res.ok || !j.ok) {
          toast(j.error ?? "Resync failed.", { tone: "danger" });
          return;
        }
        toast(`Resynced ${j.updated} task${j.updated === 1 ? "" : "s"} · ${j.cleared} cleared.`, { tone: "success" });
      } catch (e) {
        toast(e instanceof Error ? e.message : "Resync failed.", { tone: "danger" });
      } finally {
        setConfirming(false);
      }
    });
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors border border-border"
        title="Rebuild the short 'latest note' summary shown on each task from its full update history"
      >
        <RefreshCcw size={12} /> Rebuild task summaries
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <AlertTriangle size={12} className="text-warn" />
      <span className="text-fg-muted">Rebuild every task&apos;s latest-note summary?</span>
      <Button
        type="button"
        size="sm"
        variant="primary"
        onClick={run}
        disabled={pending}
      >
        {pending ? <RefreshCcw size={11} className="animate-spin" /> : <Check size={11} />}
        Confirm
      </Button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="px-2 py-1 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}
