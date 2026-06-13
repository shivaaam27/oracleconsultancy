"use client";

import { useState, useTransition } from "react";
import { Mail, Loader2, Send, X, Copy, Check } from "lucide-react";
import { recordSent } from "@/app/outbox/actions";
import { friendlyAIError } from "@/lib/ai-errors";
import { useContextActions } from "./context-actions";

type Draft = {
  subject: string;
  body: string;
  recipient: string | null;
  company: string;
  taskCode: string;
};

export function DraftEmailButton({ taskId }: { taskId: number }) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | "both" | null>(null);
  const [sending, startSend] = useTransition();
  const [sent, setSent] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setDraft(null);
    setSent(false);
    try {
      const res = await fetch("/api/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(friendlyAIError(data.error || `groq-${res.status}`).message);
        return;
      }
      const data = await res.json();
      setDraft(data);
      setSubject(data.subject);
      setBody(data.body);
      setRecipient(data.recipient || "");
    } catch {
      setError(friendlyAIError("network").message);
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied("both");
    setTimeout(() => setCopied(null), 2000);
  }

  function logSent() {
    if (!draft) return;
    startSend(async () => {
      const fd = new FormData();
      fd.set("channel", "Email");
      fd.set("name", recipient || "Team");
      fd.set("taskCodes", JSON.stringify([draft.taskCode]));
      fd.set("message", `${subject}\n\n${body}`);
      fd.set("contactStatus", "Sent");
      fd.set("recipientContact", "");
      await recordSent(fd);
      setSent(true);
      setTimeout(() => { setDraft(null); setSent(false); }, 2000);
    });
  }

  useContextActions(
    "draft-email",
    [{ id: "draft-email", label: loading ? "Drafting…" : "Draft email", icon: loading ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />, onClick: () => { if (!loading) generate(); } }],
    [loading]
  );

  return (
    <>
      {(draft || error) && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setDraft(null); setError(null); }}>
          <div className="bg-bg border border-border rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-accent" />
                <span className="font-medium text-sm">AI-Drafted Follow-up</span>
              </div>
              <button onClick={() => { setDraft(null); setError(null); }} className="p-1 rounded text-fg-muted hover:text-fg">
                <X size={16} />
              </button>
            </div>

            {error && (
              <div className="p-4">
                <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
              </div>
            )}

            {draft && (
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-fg-muted">To</label>
                  <input
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    placeholder="Recipient name"
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-fg-muted">Subject</label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-fg-muted">Body</label>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={10}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 leading-relaxed font-sans"
                  />
                </div>

                {sent && (
                  <p className="text-xs text-success bg-success/5 border border-success/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <Check size={12} /> Logged to outbox
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={copyAll}
                    className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {copied === "both" ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                  <button
                    onClick={logSent}
                    disabled={sending || sent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    {sending ? "Logging…" : "Mark as sent → Outbox"}
                  </button>
                  <button
                    onClick={generate}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 ml-auto"
                  >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : "Regenerate"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
