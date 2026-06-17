"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { MessageCircle, Check } from "lucide-react";
import { useToast } from "@/components/toast";
import { portalSendReminderWhatsApp } from "@/app/portal/actions";

/**
 * Per-person WhatsApp reminder. Sends the rich card (formatted text + branded
 * summary image) via Twilio when it's configured; when it isn't, it falls back to
 * opening WhatsApp (wa.me) with the message pre-filled for the sender to tap-send.
 */
export function WhatsAppButton({
  personId,
  personName,
  waHref,
}: {
  personId: number;
  personName: string;
  waHref: string | null;
}) {
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  if (!waHref) {
    return <span className="text-[11px] text-fg-subtle">No WhatsApp on file</span>;
  }
  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <Check size={13} /> WhatsApp sent
      </span>
    );
  }

  const send = () =>
    start(async () => {
      const res = await portalSendReminderWhatsApp(personId);
      if (res.ok) {
        setSent(true);
        toast(`WhatsApp reminder sent to ${personName}.`, { tone: "success" });
        return;
      }
      if (res.reason === "not-configured") {
        // No Twilio — open WhatsApp with the message pre-filled; sender taps send.
        window.open(waHref, "_blank", "noreferrer");
        return;
      }
      const msg =
        res.reason === "no-tasks" ? "No open tasks to remind about."
        : res.reason === "no-email" ? "No WhatsApp number on file."
        : res.error || "Couldn't send the reminder.";
      toast(msg, { tone: "warn" });
    });

  return (
    <Button size="sm" variant="secondary" onClick={send} disabled={pending}>
      <MessageCircle size={13} /> {pending ? "Sending…" : "WhatsApp reminder"}
    </Button>
  );
}
