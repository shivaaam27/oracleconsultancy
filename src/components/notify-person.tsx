"use client";

import { useState, useTransition } from "react";
import { Mail, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "./toast";
import { getGivenName } from "@/lib/names";
import { portalSendReminderEmail, portalSendTaskSummaryWhatsApp } from "@/app/portal/actions";

/**
 * Management action pair: remind a person via WhatsApp / Email.
 *  • When a `taskId` is given, a "This task / All tasks" toggle lets the sender
 *    scope the reminder to the single task or the person's whole open list.
 *  • WhatsApp → wa.me deep-link to tap-send; Email → branded reminder (real send).
 * Both re-verify role + the outreach kill switch server-side. Reused after creating
 * a task, on the Tasks list, the per-task page and the Team view.
 */
export function NotifyPerson({
  personId,
  name,
  taskId,
  className = "",
  size = "md",
}: {
  personId: number;
  name: string;
  /** When set, offer a per-task reminder (and default to it). */
  taskId?: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [scope, setScope] = useState<"task" | "all">(taskId != null ? "task" : "all");
  const first = getGivenName(name);
  // Explicit height tokens, not padding: `sm` is the 28px secondary tier (a task
  // row, the per-task page), `md` the 36px primary tier. Derived heights were how
  // these two ended up a couple of pixels off every control beside them.
  const pad = size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-9 px-3.5 text-sm";
  const tid = scope === "task" ? taskId : undefined;
  const noun = scope === "task" ? "this task" : "summary";

  const whatsapp = () => {
    // Open a blank tab synchronously inside the tap so mobile browsers don't block
    // it; we set its location once the server returns the deep-link.
    const win = window.open("", "_blank");
    start(async () => {
      const res = await portalSendTaskSummaryWhatsApp(personId, tid);
      if (!res.ok) { win?.close(); toast(res.error, { tone: "warn" }); return; }
      if (res.waHref) {
        if (win) win.location.href = res.waHref;
        else window.open(res.waHref, "_blank", "noreferrer");
        toast(`WhatsApp ${scope === "task" ? "reminder" : "summary"} ready for ${first}.`, { tone: "success" });
      } else {
        win?.close();
        toast(`No WhatsApp number on file for ${first}.`, { tone: "warn" });
      }
    });
  };

  const email = () =>
    start(async () => {
      const res = await portalSendReminderEmail(personId, tid);
      if (res.ok) { toast(`${scope === "task" ? "Reminder" : "Task summary"} emailed to ${first}.`, { tone: "success" }); return; }
      const msg =
        res.reason === "no-email" ? `No email on file for ${first}.`
        : res.reason === "no-tasks" ? "No open tasks to summarise."
        : res.reason === "not-configured" ? "Email sending isn't set up yet."
        : res.error || "Couldn't send the email.";
      toast(msg, { tone: "warn" });
    });

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {taskId != null && (
        <div className="inline-flex self-start items-center gap-0.5 rounded-md bg-bg-subtle/70 p-0.5 ring-1 ring-border text-[11px]">
          {(["task", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`inline-flex h-6 items-center rounded px-2.5 font-medium transition-colors ${scope === s ? "bg-bg-elev text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg"}`}
            >
              {s === "task" ? "This task" : "All tasks"}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={whatsapp}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 rounded-md bg-success-soft/60 font-medium text-success ring-1 ring-success/25 transition-transform hover:bg-success-soft active:scale-95 disabled:opacity-50 ${pad}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} WhatsApp {noun}
        </button>
        <button
          type="button"
          onClick={email}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 rounded-md bg-bg-elev font-medium text-fg ring-1 ring-border transition-transform hover:bg-bg-muted active:scale-95 disabled:opacity-50 ${pad}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Email {noun}
        </button>
      </div>
    </div>
  );
}
