"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquarePlus, Loader2, Send, Bell } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { channelLabel } from "@/lib/outbox/links";
import { useToast } from "./toast";
import { portalDirectorDraftMessage } from "@/app/portal/actions";

type Person = { id: number; name: string };
type Reminder = { taskCode: string; title: string; personId: number; personName: string };

const inputCls = "bare-field w-full rounded-xl ring-1 ring-border px-3.5 py-3 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40 caret-accent";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
const selectBtn = "bare-field flex w-full items-center justify-between rounded-xl ring-1 ring-border px-3.5 py-3 text-sm";

const CHANNELS = [
  { value: "", label: "Auto" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
] as const;

/** Director: message any person. Picks the recipient + channel, then "Send" opens
 *  the message PRE-FILLED in WhatsApp / email / SMS for a one-tap manual send (the
 *  same wa.me flow used elsewhere) and logs an owner-visible Outbox record. */
export function DirectorMessage({
  people, reminders = [], open: controlledOpen, onOpenChange, seedBody,
}: {
  people: Person[]; reminders?: Reminder[];
  open?: boolean; onOpenChange?: (v: boolean) => void; seedBody?: string;
}) {
  const { toast } = useToast();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setInternalOpen(v); };
  const [personId, setPersonId] = useState<string>("");
  const [channel, setChannel] = useState<string>("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const peopleOptions: FluidOption[] = people.map((p) => ({ value: String(p.id), label: p.name }));

  function openFor(r?: Reminder) {
    if (r) {
      setPersonId(String(r.personId));
      setBody(`Hi ${r.personName.split(" ")[0]}, a reminder on "${r.title}" (${r.taskCode}) — please update when you can. Thank you.`);
    }
    setOpen(true);
  }

  function reset() {
    setBody(""); setPersonId(""); setChannel("");
  }

  // When the board's smart bar opens this in controlled mode, prime the textarea.
  useEffect(() => {
    if (isControlled && open && seedBody !== undefined) setBody(seedBody);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isControlled]);

  function submit() {
    const pid = Number(personId);
    if (!Number.isFinite(pid) || pid <= 0) { toast("Choose a recipient.", { tone: "warn" }); return; }
    if (!body.trim()) { toast("Write a message.", { tone: "warn" }); return; }
    const name = (people.find((p) => p.id === pid)?.name ?? "the recipient").split(" ")[0];
    setBusy(true);
    startTransition(async () => {
      const res = await portalDirectorDraftMessage({ personId: pid, channel: (channel || undefined) as "WHATSAPP" | "EMAIL" | "SMS" | undefined, body });
      setBusy(false);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      if (res.link) {
        // Open the pre-filled message for a one-tap manual send (WhatsApp/email/SMS).
        window.open(res.link, "_blank", "noreferrer");
        toast(`Opened ${channelLabel(res.channel)} for ${name}. Saved to Outbox.`, { tone: "success" });
        setOpen(false); reset();
      } else {
        toast(`No ${channel ? channelLabel(channel as "WHATSAPP" | "EMAIL" | "SMS") + " contact" : "contact"} on file for ${name}. Saved to Outbox to send later.`, { tone: "warn" });
      }
    });
  }

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => openFor()}
          className="inline-flex items-center gap-1.5 rounded-full bg-bg-elev px-4 py-2 text-sm font-medium text-fg ring-1 ring-border transition-[background-color,transform] hover:bg-bg-muted active:scale-95"
        >
          <MessageSquarePlus size={15} /> Send a message
        </button>
      )}

      {/* Quick reminders to overdue-task assignees */}
      {!isControlled && reminders.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reminders.slice(0, 6).map((r) => (
            <button
              key={r.taskCode}
              type="button"
              onClick={() => openFor(r)}
              className="inline-flex items-center gap-1 rounded-full bg-warn-soft/50 px-2.5 py-1 text-[11px] text-warn ring-1 ring-warn/25 transition-[background-color,transform] hover:bg-warn-soft active:scale-95"
            >
              <Bell size={11} /> Remind {r.personName.split(" ")[0]} · {r.taskCode}
            </button>
          ))}
        </div>
      )}

      <BottomSheet
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Send a message"
        icon={<MessageSquarePlus size={17} />}
        footer={
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send message
          </button>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <label className={fieldLabel}>Recipient</label>
            <FluidSelect value={personId} options={peopleOptions} placeholder="Choose a person…" onSelect={setPersonId} buttonClassName={selectBtn} />
          </div>
          <div>
            <label className={fieldLabel}>Channel</label>
            <div className="grid grid-cols-4 gap-1.5">
              {CHANNELS.map((c) => {
                const active = channel === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChannel(c.value)}
                    className={`rounded-xl py-2.5 text-[12px] font-medium ring-1 transition-colors ${active ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-subtle/60 text-fg-muted ring-border hover:text-fg"}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className={fieldLabel}>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Your message…" className={inputCls} />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
