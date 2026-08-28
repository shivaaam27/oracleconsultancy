"use client";

import { useState, useTransition } from "react";
import { ChevronDown, MessageSquarePlus, Bell, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "./toast";
import { CompleteTaskSheet } from "./complete-task-sheet";
import { NotifyPerson } from "./notify-person";
import { portalRemindTask } from "@/app/portal/actions";
import { getGivenName } from "@/lib/names";

/* The per-task page quick-action bar: jump to posting an update, complete the
 * task through the secure gate (note required + proof if the task needs it),
 * and — for management — draft a reminder to the owner. */
export function TaskQuickActions({
  taskId, code, ownerName, ownerId = null, canRemind, canComplete, requiresAttachment = false,
}: {
  taskId: number;
  code: string;
  ownerName: string | null;
  ownerId?: number | null;
  canRemind: boolean;
  canComplete: boolean;
  requiresAttachment?: boolean;
}) {
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [completeOpen, setCompleteOpen] = useState(false);

  function remind() {
    start(async () => {
      const res = await portalRemindTask(taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Reminder ready for ${getGivenName(res.name)}.`, {
        tone: "success",
        action: res.link ? { label: "Send now", onClick: () => { window.open(res.link!, "_blank"); } } : undefined,
      });
    });
  }

  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* The page's PRIMARY row. All three take the same explicit h-9 (36px) —
          the record-page primary height, matching the Priority/Due/Classify
          controls below. Heights here used to come from `py-3`, which is how
          the trio ended up 44/41/41 and never lined up. Owner's call, 17 Aug. */}
      <a
        href="#conversation"
        className="inline-flex h-9 min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98]"
      >
        <MessageSquarePlus size={15} /> Add update
      </a>
      {canComplete && (
        <button
          type="button"
          onClick={() => setCompleteOpen(true)}
          /* ⚠️ ONE PRIMARY, TWO MATCHING SECONDARIES. This row was a solid blue
             button, a soft-GREEN filled button and a white outlined one — three
             treatments for three peers, which is what made the row read as
             three unrelated controls. Complete and Remind are the same shape
             now; the green survives on the TICK, where it means "finished",
             rather than as a block behind the words. */
          className="inline-flex h-9 min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elev px-3.5 text-sm font-medium text-fg transition-colors hover:border-success/50 hover:bg-success-soft/40 active:scale-95"
        >
          <CheckCircle2 size={15} className="text-success" /> Complete
        </button>
      )}
      {canRemind && (
        <button
          type="button"
          onClick={remind}
          disabled={busy}
          className="inline-flex h-9 min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elev px-3.5 text-sm font-medium text-fg transition-colors hover:border-accent/50 hover:bg-bg-muted active:scale-95 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          Remind{ownerName ? ` ${getGivenName(ownerName)}` : ""}
        </button>
      )}

      <CompleteTaskSheet open={completeOpen} onClose={() => setCompleteOpen(false)} taskId={taskId} code={code} requiresAttachment={requiresAttachment} />

      {/* ⚠️ THE "REMIND — THIS TASK OR THEIR WHOLE LIST" STRIP IS GONE (owner,
          28 Aug 2026). It was a loose line under the buttons opening a second
          set of reminder controls, and it read as a section of its own without
          being one. **Reminding is not gone**: the Remind button above still
          does the common thing in one press and its toast offers "Send now".
          Somebody's whole list is reachable from the Outbox, which is what that
          page is for. */}
    </div>
  );
}
