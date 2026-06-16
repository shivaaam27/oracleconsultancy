"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send, XCircle, MessageCircleWarning } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/components/toast";
import { sendTestWhatsApp } from "./actions";

/**
 * WhatsApp (Twilio) status + a self-serve test send. Mirrors EmailStatus: shows
 * whether Twilio is configured and lets the owner fire a real test to any number
 * to confirm delivery end-to-end. In the Twilio sandbox the recipient must first
 * have texted the join code.
 */
export function WhatsAppStatus({
  configured,
  defaultTo,
}: {
  configured: boolean;
  defaultTo: string;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState(defaultTo);
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<"sent" | "failed" | null>(null);

  function send() {
    setLastResult(null);
    startTransition(async () => {
      const res = await sendTestWhatsApp(to);
      if (res.ok) {
        setLastResult("sent");
        toast(`Test WhatsApp sent to ${to}.`, { tone: "success", duration: 6000 });
      } else {
        setLastResult("failed");
        toast(res.error ?? "Could not send the test message.", { tone: res.reason === "not-configured" ? "warn" : "danger", duration: 7000 });
      }
    });
  }

  return (
    <div className="max-w-xl space-y-3 rounded-xl bg-bg-subtle/40 ring-1 ring-border/60 p-3.5">
      <div className="flex items-center gap-2 text-sm">
        {configured ? (
          <>
            <CheckCircle2 size={16} className="text-success shrink-0" />
            <span className="font-medium">WhatsApp sending is on</span>
            <span className="text-fg-muted">· via Twilio</span>
          </>
        ) : (
          <>
            <MessageCircleWarning size={16} className="text-warn shrink-0" />
            <span className="font-medium">WhatsApp sending is off</span>
            <span className="text-fg-muted">· using manual wa.me links</span>
          </>
        )}
      </div>

      {configured ? (
        <>
          <p className="text-xs text-fg-muted">
            Send a test to confirm it arrives. In the Twilio <span className="font-medium text-fg">sandbox</span>,
            the number must first have texted the join code to the sandbox number.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="tel"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+255686450999"
              className="w-full sm:w-64"
            />
            <Button type="button" variant="primary" size="sm" loading={pending} onClick={send}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send test
            </Button>
            {lastResult === "sent" && <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 size={13} /> Sent</span>}
            {lastResult === "failed" && <span className="inline-flex items-center gap-1 text-xs text-danger"><XCircle size={13} /> Failed</span>}
          </div>
        </>
      ) : (
        <p className="text-xs text-fg-muted">
          Add the Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM) to switch
          this on. Until then, the Outbox prepares copy-ready drafts and a one-tap wa.me link.
        </p>
      )}
    </div>
  );
}
