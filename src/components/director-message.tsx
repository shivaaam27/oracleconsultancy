"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, Loader2, Send, Bell, Search, Check, X } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { channelLabel } from "@/lib/outbox/links";
import { getGivenName } from "@/lib/names";
import { useToast } from "./toast";
import {
  portalDirectorChatMessage,
  portalDirectorDraftMessage,
  portalDirectorGroupEmail,
} from "@/app/portal/actions";

type Person = { id: number; name: string };
type Reminder = { taskCode: string; title: string; personId: number; personName: string };

const inputCls = "bare-field w-full rounded-xl ring-1 ring-border px-3.5 py-3 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40 caret-accent";
const fieldLabel = "mb-1.5 block text-xs font-medium text-fg-muted";

const CHANNELS = [
  { value: "CHAT", label: "Chat" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "", label: "Auto" },
] as const;

// Channels that can address several people at once. WhatsApp / SMS / Auto stay
// one-to-one (Auto picks each person's single best channel).
function isMulti(channel: string): boolean {
  return channel === "CHAT" || channel === "EMAIL";
}

function recipientHint(channel: string): string {
  switch (channel) {
    case "CHAT": return "One person opens a direct chat; several start a group.";
    case "EMAIL": return "Email one or several people (all share the To line).";
    case "WHATSAPP": return "WhatsApp opens for one person.";
    case "SMS": return "SMS opens for one person.";
    default: return "Auto picks the recipient's best channel — one person.";
  }
}

/** Director: message any person. Channels:
 *  - Chat  → posts into the built-in chat (continues an existing DM, or starts a
 *    group for several people) and jumps you into the conversation.
 *  - WhatsApp / Email / SMS / Auto → opens the message PRE-FILLED for a one-tap
 *    manual send and logs an owner-visible Outbox record. Email can address
 *    several people at once; WhatsApp + SMS stay one-to-one. */
export function DirectorMessage({
  people, reminders = [], open: controlledOpen, onOpenChange, seedBody,
}: {
  people: Person[]; reminders?: Reminder[];
  open?: boolean; onOpenChange?: (v: boolean) => void; seedBody?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setInternalOpen(v); };
  const [picked, setPicked] = useState<number[]>([]);
  const [channel, setChannel] = useState<string>("CHAT");
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const multi = isMulti(channel);
  const pickedPeople = picked.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[];
  const list = people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  function togglePerson(id: number) {
    setPicked((cur) => {
      if (isMulti(channel)) return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      // Single-only channels behave like a radio: pick replaces.
      return cur.length === 1 && cur[0] === id ? [] : [id];
    });
  }

  // Switching to a one-to-one channel with several picked → keep just the first.
  useEffect(() => {
    if (!multi && picked.length > 1) setPicked((cur) => cur.slice(0, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  function openFor(r?: Reminder) {
    if (r) {
      setPicked([r.personId]);
      setBody(`Hi ${getGivenName(r.personName)}, a reminder on "${r.title}" (${r.taskCode}) — please update when you can. Thank you.`);
    }
    setOpen(true);
  }

  function reset() {
    setBody(""); setPicked([]); setChannel("CHAT"); setQuery("");
  }

  // When the board's smart bar opens this in controlled mode, prime the textarea.
  useEffect(() => {
    if (isControlled && open && seedBody !== undefined) setBody(seedBody);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isControlled]);

  function submit() {
    if (picked.length === 0) { toast("Choose at least one recipient.", { tone: "warn" }); return; }
    if (!body.trim()) { toast("Write a message.", { tone: "warn" }); return; }
    setBusy(true);
    // For link-opening channels, open a blank tab synchronously inside the tap so
    // mobile browsers don't block it; we set its location once the link returns.
    // Chat navigates internally with router.push, so it never opens a blank tab.
    const win = channel !== "CHAT" ? window.open("", "_blank") : null;
    startTransition(async () => {
      // ---- Chat: post into the built-in messenger (DM or group) ----
      if (channel === "CHAT") {
        const res = await portalDirectorChatMessage({ personIds: picked, body });
        setBusy(false);
        if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
        toast(res.group ? "Group chat started." : "Message sent.", { tone: "success" });
        setOpen(false); reset();
        router.push(`/portal/chat/${res.threadId}`);
        return;
      }

      // ---- Email to several people: one mail to all ----
      if (channel === "EMAIL" && picked.length > 1) {
        const res = await portalDirectorGroupEmail({ personIds: picked, body });
        setBusy(false);
        if (!res.ok) { win?.close(); toast(res.error, { tone: "danger" }); return; }
        const sent = picked.length - res.missing.length;
        if (res.link) {
          if (win) win.location.href = res.link;
          else window.open(res.link, "_blank", "noreferrer");
        } else win?.close();
        const tail = res.missing.length ? ` ${res.missing.length} had no email on file.` : "";
        toast(`Opened email to ${sent} ${sent === 1 ? "person" : "people"}. Saved to Outbox.${tail}`, { tone: res.missing.length ? "warn" : "success" });
        setOpen(false); reset();
        return;
      }

      // ---- Single recipient: WhatsApp / SMS / Email(1) / Auto ----
      const pid = picked[0];
      const name = getGivenName(people.find((p) => p.id === pid)?.name ?? "the recipient");
      const res = await portalDirectorDraftMessage({ personId: pid, channel: (channel || undefined) as "WHATSAPP" | "EMAIL" | "SMS" | undefined, body });
      setBusy(false);
      if (!res.ok) { win?.close(); toast(res.error, { tone: "danger" }); return; }
      if (res.link) {
        if (win) win.location.href = res.link;
        else window.open(res.link, "_blank", "noreferrer");
        toast(`Opened ${channelLabel(res.channel)} for ${name}. Saved to Outbox.`, { tone: "success" });
        setOpen(false); reset();
      } else {
        win?.close();
        toast(`No ${channel ? channelLabel(channel as "WHATSAPP" | "EMAIL" | "SMS") + " contact" : "contact"} on file for ${name}. Saved to Outbox to send later.`, { tone: "warn" });
      }
    });
  }

  const sendLabel = channel === "CHAT"
    ? (picked.length > 1 ? "Send to group" : "Send message")
    : channel === "EMAIL" && picked.length > 1 ? "Open group email" : "Send message";

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => openFor()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-bg-elev px-3.5 text-sm font-medium text-fg ring-1 ring-border transition-[background-color,transform] hover:bg-bg-muted active:scale-95"
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
              className="inline-flex items-center gap-1 rounded-full bg-warn-soft/50 px-2.5 py-1 text-xs text-warn ring-1 ring-warn/25 transition-[background-color,transform] hover:bg-warn-soft active:scale-95"
            >
              <Bell size={11} /> Remind {getGivenName(r.personName)} · {r.taskCode}
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
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sendLabel}
          </button>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <label className={fieldLabel}>Channel</label>
            <div className="grid grid-cols-5 gap-1.5">
              {CHANNELS.map((c) => {
                const active = channel === c.value;
                return (
                  <button
                    key={c.value || "auto"}
                    type="button"
                    onClick={() => setChannel(c.value)}
                    className={`rounded-xl py-2.5 text-xs font-medium ring-1 transition-colors ${active ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-subtle/60 text-fg-muted ring-border hover:text-fg"}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={fieldLabel}>
              {multi ? "Recipients" : "Recipient"}
              {picked.length > 0 && <span className="ml-1 text-accent">· {picked.length}</span>}
            </label>

            {pickedPeople.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pickedPeople.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPicked((cur) => cur.filter((x) => x !== p.id))}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent ring-1 ring-accent/25"
                    title={`Remove ${p.name}`}
                  >
                    {p.name.split(/\s+/)[0]} <X size={12} />
                  </button>
                ))}
              </div>
            )}

            <div className="relative mb-1.5">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people…"
                className="bare-field w-full rounded-xl py-2.5 pl-9 pr-3 text-sm ring-1 ring-border placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl ring-1 ring-border/60 p-1">
              {list.length === 0 ? (
                <p className="px-3 py-6 text-center text-base text-fg-muted">No people found.</p>
              ) : (
                list.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePerson(p.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${on ? "bg-accent-soft" : "hover:bg-bg-subtle"}`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${on ? "bg-accent text-accent-fg" : "ring-1 ring-border"}`}>
                        {on && <Check size={13} />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <p className="mt-1.5 text-xs text-fg-subtle">{recipientHint(channel)}</p>
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
