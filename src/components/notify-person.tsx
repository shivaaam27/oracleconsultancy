"use client";

import { useTransition } from "react";
import { Mail, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "./toast";
import { portalSendReminderEmail, portalSendTaskSummaryWhatsApp } from "@/app/portal/actions";

/**
 * Management action pair: send a person a summary of ALL their open tasks.
 *  • WhatsApp → detailed summary (status/priority/deadline/overdue/responsible/
 *    description/latest update) opened as a wa.me deep-link to tap-send.
 *  • Email → the branded task-reminder email (real send via the shared engine).
 * Both re-verify role + the outreach kill switch server-side. Reused after creating
 * a task, on the Tasks list, the per-task page and the Team view.
 */
export function NotifyPerson({
  personId,
  name,
  className = "",
  size = "md",
}: {
  personId: number;
  name: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const first = name.split(" ")[0] || name;
  const pad = size === "sm" ? "px-2.5 py-1.5 text-[12px]" : "px-3 py-2 text-sm";

  const whatsapp = () =>
    start(async () => {
      const res = await portalSendTaskSummaryWhatsApp(personId);
      if (!res.ok) { toast(res.error, { tone: "warn" }); return; }
      if (res.waHref) {
        window.open(res.waHref, "_blank", "noreferrer");
        toast(`WhatsApp summary ready for ${first}.`, { tone: "success" });
      } else {
        toast(`No WhatsApp number on file for ${first}.`, { tone: "warn" });
      }
    });

  const email = () =>
    start(async () => {
      const res = await portalSendReminderEmail(personId);
      if (res.ok) { toast(`Task summary emailed to ${first}.`, { tone: "success" }); return; }
      const msg =
        res.reason === "no-email" ? `No email on file for ${first}.`
        : res.reason === "no-tasks" ? "No open tasks to summarise."
        : res.reason === "not-configured" ? "Email sending isn't set up yet."
        : res.error || "Couldn't send the email.";
      toast(msg, { tone: "warn" });
    });

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={whatsapp}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-full bg-success-soft/60 font-medium text-success ring-1 ring-success/25 transition-transform hover:bg-success-soft active:scale-95 disabled:opacity-50 ${pad}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} WhatsApp summary
      </button>
      <button
        type="button"
        onClick={email}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-full bg-bg-elev font-medium text-fg ring-1 ring-border transition-transform hover:bg-bg-muted active:scale-95 disabled:opacity-50 ${pad}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Email summary
      </button>
    </div>
  );
}
