"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send, XCircle, MailWarning } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/components/toast";
import { sendTestEmail } from "./actions";

/**
 * Email-sending status + a self-serve test send. Shows whether a mailbox is
 * configured (and via which provider) and lets the owner fire a real test to
 * any address to confirm delivery end-to-end.
 */
export function EmailStatus({
  configured,
  provider,
  from,
  defaultTo,
}: {
  configured: boolean;
  provider: string | null;
  from: string;
  defaultTo: string;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState(defaultTo);
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<"sent" | "failed" | null>(null);

  function send() {
    setLastResult(null);
    startTransition(async () => {
      const res = await sendTestEmail(to);
      if (res.ok) {
        setLastResult("sent");
        toast(`Test email sent to ${to}.`, { tone: "success", duration: 6000 });
      } else {
        setLastResult("failed");
        toast(res.error ?? "Could not send the test email.", { tone: res.reason === "not-configured" ? "warn" : "danger", duration: 7000 });
      }
    });
  }

  const providerLabel = provider === "smtp" ? "Gmail / SMTP" : provider === "resend" ? "Resend" : null;

  return (
    <div className="max-w-xl space-y-3 rounded-xl bg-bg-subtle/40 ring-1 ring-border/60 p-3.5">
      <div className="flex items-center gap-2 text-sm">
        {configured ? (
          <>
            <CheckCircle2 size={16} className="text-success shrink-0" />
            <span className="font-medium">Email sending is on</span>
            <span className="text-fg-muted">· via {providerLabel}</span>
          </>
        ) : (
          <>
            <MailWarning size={16} className="text-warn shrink-0" />
            <span className="font-medium">Email sending is off</span>
            <span className="text-fg-muted">· using manual “Open email” links</span>
          </>
        )}
      </div>

      {configured ? (
        <>
          <p className="text-xs text-fg-muted">
            Sends as <span className="font-medium text-fg">{from}</span>. Send a test to confirm it arrives.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@example.com"
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
          Add the mailbox credentials (Gmail app password) to switch this on. Until then, the Outbox prepares
          copy-ready drafts and an “Open email” link.
        </p>
      )}
    </div>
  );
}
