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
          className="inline-flex h-9 min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-success-soft px-3.5 text-sm font-medium text-success ring-1 ring-success/25 transition-transform active:scale-95"
        >
          <CheckCircle2 size={15} /> Complete
        </button>
      )}
      {canRemind && (
        <button
          type="button"
          onClick={remind}
          disabled={busy}
          className="inline-flex h-9 min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-bg-elev px-3.5 text-sm font-medium text-fg ring-1 ring-border transition-transform hover:bg-bg-muted active:scale-95 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          Remind{ownerName ? ` ${getGivenName(ownerName)}` : ""}
        </button>
      )}

      <CompleteTaskSheet open={completeOpen} onClose={() => setCompleteOpen(false)} taskId={taskId} code={code} requiresAttachment={requiresAttachment} />

      {/* The finer reminder choices, folded away.

          "Remind" above already does the common thing in one tap, and its toast
          offers "Send now". This block — a sentence, a This task / All tasks
          toggle and two send buttons — repeated that in 110px of always-on
          controls, and it was the untidiest part of the record. It is a line you
          can open when you want their whole list instead. */}
      {canRemind && ownerId != null && (
        <div className="w-full border-t border-border/50 pt-2.5">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            Remind {getGivenName(ownerName ?? "them")} — this task or their whole list
            <ChevronDown size={12} className={moreOpen ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {moreOpen && (
            <div className="mt-2">
              <NotifyPerson personId={ownerId} name={ownerName ?? "this person"} taskId={taskId} size="sm" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
