"use client";

import { useState } from "react";
import { Sparkles, ArrowUp, Bolt, CalendarPlus, MessageSquarePlus, type LucideIcon } from "lucide-react";
import { CaretInput } from "./ui";
import { DirectorTaskForm } from "./director-task-form";
import { DirectorEventForm } from "./director-event-form";
import { DirectorMessage } from "./director-message";

/* ------------------------------------------------------------------ *
 * Smart capture bar (director board). ONE input for everything — type a
 * task, an event ("meet Asha Fri 3pm") or a message ("tell Ravi…"), press
 * Enter, and a small popup asks "what is this about?" (Task / Event /
 * Message). Pick one and the matching iPhone sheet opens PRE-FILLED with
 * what you typed, so the required fields (company / who / when) are
 * confirmed in one place. No mode chips, no rotating suggestions — clean.
 * ------------------------------------------------------------------ */

type Person = { id: number; name: string; companyId: number | null; companyIds?: number[] };
type Company = { id: number; name: string };
type Mode = "Task" | "Event" | "Message";

const CHOICES: { key: Mode; icon: LucideIcon; label: string; hint: string }[] = [
  { key: "Task", icon: Bolt, label: "Task", hint: "Something to get done" },
  { key: "Event", icon: CalendarPlus, label: "Event", hint: "Meeting or appointment" },
  { key: "Message", icon: MessageSquarePlus, label: "Message", hint: "A note to someone" },
];

/** Lightweight, instant intent heuristic (no AI call) — only used to gently
 *  pre-highlight the likeliest choice in the popup. Message + Event cues,
 *  otherwise a task. */
function detectMode(s: string): Mode {
  const t = ` ${s.toLowerCase()} `;
  if (/\b(tell|message|msg|remind|ping|email|reply|let .* know|follow ?up)\b/.test(t)) return "Message";
  if (
    /\b(meet|meeting|call|event|appointment|catch ?up|sync|review|standup|stand-up|workshop|lunch|dinner|interview|board call|tomorrow|today|tonight|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week)\b/.test(t)
    || /\b\d{1,2}\s?(am|pm)\b/.test(t)
    || /\b\d{1,2}:\d{2}\b/.test(t)
  ) return "Event";
  return "Task";
}

export function SmartCaptureBar({
  people, companies, modes = ["Task", "Event", "Message"], canRepeat,
}: {
  people: Person[];
  companies: Company[];
  /** Which capture modes this operator may use. Managers get Task-only; the
   *  full board (directors) gets all three. */
  modes?: Mode[];
  /** me.caps.recurringTasks — shows the task composer's "Repeat" section. */
  canRepeat?: boolean;
}) {
  const [text, setText] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [sheet, setSheet] = useState<Mode | null>(null);
  const [seed, setSeed] = useState("");

  const allowed = CHOICES.filter((c) => modes.includes(c.key));
  const trimmed = text.trim();
  const detected = detectMode(text);
  // Clamp the pre-highlight to an allowed mode.
  const suggested = modes.includes(detected) ? detected : modes[0];
  const placeholder =
    modes.length === 1
      ? modes[0] === "Task" ? "Assign a task…" : modes[0] === "Event" ? "Schedule an event…" : "Send a message…"
      : "Assign a task, event or message…";

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!trimmed) return;
    setSeed(trimmed);
    // With a single allowed mode there's nothing to choose — open it directly.
    if (allowed.length === 1) setSheet(allowed[0].key);
    else setChoosing(true);
  }

  function choose(m: Mode) {
    setChoosing(false);
    setSheet(m);
  }

  // Reset the bar once a sheet closes (whether sent or cancelled).
  function onSheetToggle(v: boolean) {
    if (!v) { setSheet(null); setText(""); setChoosing(false); }
  }

  return (
    <div className="relative rounded-3xl bg-bg-elev p-2.5 ring-1 ring-border elevated">
      <form
        onSubmit={submit}
        className="flex items-center gap-2 rounded-2xl px-3 py-1 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40"
      >
        <Sparkles size={16} className="shrink-0 text-accent" />
        <CaretInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={!trimmed}
          aria-label="Continue"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          <ArrowUp size={18} />
        </button>
      </form>

      {/* Intent popup — appears on submit, asks what the typed text is about.
          The likeliest choice is gently pre-highlighted. */}
      {choosing && (
        <>
          <button type="button" aria-label="Cancel" onClick={() => setChoosing(false)} className="fixed inset-0 z-40 cursor-default" />
          <div className="absolute inset-x-2.5 top-full z-50 mt-2 rounded-2xl bg-bg-elev p-2 ring-1 ring-border shadow-lg">
            <p className="px-1.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">What is this about?</p>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {allowed.map((c) => {
                const Icon = c.icon;
                const hot = suggested === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    autoFocus={hot}
                    onClick={() => choose(c.key)}
                    className={`flex items-center gap-2.5 rounded-xl p-2.5 text-left ring-1 transition-colors ${hot ? "bg-accent-soft ring-accent/30" : "bg-bg-subtle/40 ring-border hover:bg-bg-subtle/70"}`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${hot ? "bg-accent text-accent-fg" : "bg-bg-elev text-accent ring-1 ring-border"}`}><Icon size={15} /></span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium leading-tight">{c.label}</span>
                      <span className="block truncate text-[11px] text-fg-subtle">{hot ? "Looks like this" : c.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Controlled sheets, pre-filled with what was typed. Only the allowed
          modes are mounted, so a Task-only operator can never open Event/Message. */}
      {modes.includes("Task") && <DirectorTaskForm people={people} companies={companies} open={sheet === "Task"} onOpenChange={onSheetToggle} seedTitle={seed} canRepeat={canRepeat} />}
      {modes.includes("Event") && <DirectorEventForm people={people} companies={companies} open={sheet === "Event"} onOpenChange={onSheetToggle} seedTitle={seed} />}
      {modes.includes("Message") && <DirectorMessage people={people} open={sheet === "Message"} onOpenChange={onSheetToggle} seedBody={seed} />}
    </div>
  );
}
