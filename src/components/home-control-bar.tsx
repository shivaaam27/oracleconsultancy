"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, ListChecks, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { runAutomationsNowAction, sendBriefNowAction } from "@/app/_hub/control-actions";

/* The engine, as a calm tab strip at the foot of the home page: Run automations ·
 * Send Brief · Approvals. Moved out of the hero (owner's call) so the top card
 * stays clean. Three equal cells; the fire actions report via a toast + refresh. */

export function HomeControlBar({ pendingApprovals }: { pendingApprovals: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function fire(key: string, action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setBusy(key);
    start(async () => {
      const res = await action();
      setBusy(null);
      if (!res.ok) return toast(res.error, { tone: "warn", duration: 4000 });
      toast(res.message, { tone: "success", duration: 4000 });
      router.refresh();
    });
  }

  const cell =
    "flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium text-fg-muted transition-all hover:bg-bg-elev hover:text-fg disabled:cursor-wait disabled:opacity-60";

  return (
    <div className="grid grid-cols-3 gap-1.5 rounded-3xl bg-bg-subtle/50 p-1.5 ring-1 ring-border/60">
      <button type="button" onClick={() => fire("run", runAutomationsNowAction)} disabled={busy !== null} className={cell}>
        {busy === "run" ? <Loader2 size={15} className="animate-spin text-accent" /> : <Zap size={15} className="hidden text-accent sm:block" />}
        <span className="whitespace-nowrap">Run automations</span>
      </button>
      <button type="button" onClick={() => fire("brief", sendBriefNowAction)} disabled={busy !== null} className={cell}>
        {busy === "brief" ? <Loader2 size={15} className="animate-spin text-accent" /> : <FileText size={15} className="hidden text-accent sm:block" />}
        <span className="whitespace-nowrap">Send Brief</span>
      </button>
      <Link href="/approvals" className={cn(cell, "relative")}>
        <ListChecks size={15} className="hidden text-accent sm:block" />
        <span className="whitespace-nowrap">Approvals</span>
        {pendingApprovals > 0 && (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular text-white">
            {pendingApprovals}
          </span>
        )}
      </Link>
    </div>
  );
}
