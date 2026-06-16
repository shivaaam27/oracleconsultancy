"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { Mail, Check } from "lucide-react";
import { useToast } from "@/components/toast";
import { portalSendReminderEmail } from "@/app/portal/actions";

/** Per-person "email reminder" with an optional personal note. Sends the branded
 *  task-reminder email via the shared engine (signed off as the sender's office). */
export function RemindButton({
  personId,
  personName,
  hasEmail,
}: {
  personId: number;
  personName: string;
  hasEmail: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <Check size={13} /> Reminder sent
      </span>
    );
  }

  if (!hasEmail) {
    return <span className="text-[11px] text-fg-subtle">No email on file</span>;
  }

  const send = () =>
    start(async () => {
      const res = await portalSendReminderEmail(personId, note.trim() || undefined);
      if (res.ok) {
        setSent(true);
        toast(`Reminder emailed to ${personName}.`, { tone: "success" });
        return;
      }
      const msg =
        res.reason === "no-tasks" ? "No open tasks to remind about."
        : res.reason === "no-email" ? "No email address on file."
        : res.reason === "not-configured" ? "Email sending isn't switched on."
        : res.error || "Couldn't send the reminder.";
      toast(msg, { tone: "warn" });
    });

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Mail size={13} /> Email reminder
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a personal line (optional) — appears at the top of the email"
        className="w-full min-h-[54px] text-xs font-sans text-fg leading-relaxed bg-bg-elev border border-border rounded-lg p-2 focus:outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={send} disabled={pending}>
          <Mail size={13} /> {pending ? "Sending…" : "Send reminder"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-fg-subtle hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
