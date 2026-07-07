"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui";
import { useToast } from "@/components/toast";
import { toggleAutomationActive, cancelAutomation } from "./actions";

/** The pause/resume Switch + cancel control for one automation row. Client-only
 *  interactivity; all data is passed down from the server page. Reuses the iPhone
 *  Switch and the shared toast. */
export function AutomationControls({ id, active }: { id: number; active: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function onToggle() {
    start(async () => {
      const res = await toggleAutomationActive(id, !active);
      if (!res.ok) toast(res.error ?? "Could not update.", { tone: "danger" });
      else router.refresh();
    });
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
