"use client";

import { useState, useTransition } from "react";
import { MessageSquarePlus, X, Loader2, Send, ExternalLink, Bell } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/surface-kit";
import { useToast } from "./toast";
import { portalDirectorDraftMessage } from "@/app/portal/actions";

type Person = { id: number; name: string };
type Reminder = { taskCode: string; title: string; personId: number; personName: string };

const inputCls = "w-full rounded-xl bg-bg-subtle ring-1 ring-border px-3 py-2.5 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40";

/** Director: draft a reminder/message (Outbox) + one-tap deep-link to send.
 *  Defaults to a task's assignee when started from a quick-reminder; otherwise
 *  the director picks the recipient. */
export function DirectorMessage({ people, reminders = [] }: { people: Person[]; reminders?: Reminder[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState<string>("");
  const [channel, setChannel] = useState<string>("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ link: string | null; contactMissing: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function openFor(r?: Reminder) {
    setResult(null);
    if (r) {
      setPersonId(String(r.personId));
      setBody(`Hi ${r.personName.split(" ")[0]}, a reminder on "${r.title}" (${r.taskCode}) — please update when you can. Thank you.`);
    }
    setOpen(true);
  }

  function submit() {
    const pid = Number(personId);
    if (!Number.isFinite(pid) || pid <= 0) { toast("Choose a recipient.", { tone: "warn" }); return; }
    if (!body.trim()) { toast("Write a message.", { tone: "warn" }); return; }
    setBusy(true);
    startTransition(async () => {
      const res = await portalDirectorDraftMessage({ personId: pid, channel: (channel || undefined) as "WHATSAPP" | "EMAIL" | "SMS" | undefined, body });
      setBusy(false);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      setResult({ link: res.link, contactMissing: res.contactMissing });
      toast("Saved to Outbox.", { tone: "success" });
    });
  }

  return (
    <>
      <button type="button" onClick={() => openFor()}
        className="inline-flex items-center gap-1.5 rounded-full bg-bg-elev ring-1 ring-border px-4 py-2 text-sm font-medium text-fg hover:bg-bg-muted transition-colors">
        <MessageSquarePlus size={15} /> Send a message
      </button>

      {/* Quick reminders to overdue-task assignees */}
      {reminders.length > 0 && !open && (
        <div className="flex flex-wrap gap-1.5">
          {reminders.slice(0, 6).map((r) => (
            <button key={r.taskCode} type="button" onClick={() => openFor(r)}
              className="inline-flex items-center gap-1 rounded-full bg-warn-soft/50 ring-1 ring-warn/25 text-warn px-2.5 py-1 text-[11px] hover:bg-warn-soft transition-colors">
              <Bell size={11} /> Remind {r.personName.split(" ")[0]} · {r.taskCode}
            </button>
          ))}
        </div>
      )}

      {open && (
        <Panel glass className="p-4 w-full">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquarePlus size={15} className="text-accent" />
            <span className="text-sm font-semibold">Send a message</span>
            <button type="button" onClick={() => { setOpen(false); setResult(null); }} className="ml-auto text-fg-muted hover:text-fg"><X size={15} /></button>
          </div>
          {result ? (
            <div className="space-y-2">
              <p className="text-sm text-fg-muted">Saved to Outbox{result.contactMissing ? " — no contact saved for this person yet." : "."}</p>
              <div className="flex items-center gap-2">
                {result.link && (
                  <a href={result.link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
                    <Send size={14} /> Send now
                  </a>
                )}
                <Link href="/outbox" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-accent">
                  <ExternalLink size={13} /> Outbox
                </Link>
                <button type="button" onClick={() => { setResult(null); setBody(""); setPersonId(""); }} className="text-sm text-fg-muted hover:text-fg px-1">New</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={inputCls}>
                  <option value="" disabled>Recipient…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
                  <option value="">Channel — auto</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                </select>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Your message…" className={inputCls} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={submit} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />} Draft message
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-fg-muted hover:text-fg px-2">Cancel</button>
              </div>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
