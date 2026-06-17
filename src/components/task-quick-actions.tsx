"use client";

import { useTransition } from "react";
import { MessageSquarePlus, Bell, Loader2 } from "lucide-react";
import { useToast } from "./toast";
import { portalRemindTask } from "@/app/portal/actions";

/* The per-task page quick-action bar: jump straight to posting an update, and
 * (for management) draft a reminder to the owner without scrolling. Sits under
 * the task hero. */
export function TaskQuickActions({
  taskId, ownerName, canRemind,
}: {
  taskId: number;
  ownerName: string | null;
  canRemind: boolean;
}) {
  const { toast } = useToast();
  const [busy, start] = useTransition();

  function remind() {
    start(async () => {
      const res = await portalRemindTask(taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Reminder for ${res.name.split(" ")[0]} saved to Outbox.`, {
        tone: "success",
        action: res.link ? { label: "Send now", onClick: () => { window.open(res.link!, "_blank"); } } : undefined,
      });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href="#conversation"
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98]"
      >
        <MessageSquarePlus size={15} /> Add update
      </a>
      {canRemind && (
        <button
          type="button"
          onClick={remind}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-bg-elev px-4 py-3 text-sm font-medium text-fg ring-1 ring-border transition-transform hover:bg-bg-muted active:scale-95 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          Remind{ownerName ? ` ${ownerName.split(" ")[0]}` : ""}
        </button>
      )}
    </div>
  );
}
