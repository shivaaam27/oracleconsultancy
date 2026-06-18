"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowUp, Bolt, CalendarPlus, MessageSquarePlus, Users, Wand2, CornerDownLeft, type LucideIcon } from "lucide-react";
import { CaretInput } from "./ui";
import { DirectorTaskForm } from "./director-task-form";
import { DirectorEventForm } from "./director-event-form";
import { DirectorMessage } from "./director-message";

/* ------------------------------------------------------------------ *
 * Smart capture bar (director board). One input that reads intent —
 * type a task, an event ("meet Asha Fri 3pm"), or a message ("tell
 * Ravi…"). The three mode chips bias it; pressing Enter (or the arrow)
 * opens the matching iPhone sheet PRE-FILLED with what you typed, so the
 * required fields (company / who / when) are confirmed in one place.
 * ------------------------------------------------------------------ */

type Person = { id: number; name: string; companyId: number | null };
type Company = { id: number; name: string };
type Mode = "Task" | "Event" | "Message";

const MODES: { key: Mode; icon: LucideIcon; label: string; placeholder: string }[] = [
  { key: "Task", icon: Bolt, label: "Task", placeholder: "Assign a task in seconds…" },
  { key: "Event", icon: CalendarPlus, label: "Event", placeholder: "Add an event or meeting…" },
  { key: "Message", icon: MessageSquarePlus, label: "Message", placeholder: "Message someone…" },
];

/** Lightweight, instant intent heuristic (no AI call). Message + Event cues,
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
  people, companies, suggestions,
}: {
  people: Person[];
  companies: Company[];
  suggestions?: { code: string; actionItem: string; companyName: string }[];
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("Task");
  const [userPicked, setUserPicked] = useState(false);
  const [sheet, setSheet] = useState<Mode | null>(null);
  const [seed, setSeed] = useState("");

  const trimmed = text.trim();
  const suggested = detectMode(text);
  // Auto-follow the detected intent until the user explicitly taps a chip.
  useEffect(() => { if (!userPicked) setMode(suggested); }, [suggested, userPicked]);

  // Rotate gently through the top urgent tasks while the bar is empty. The list
  // itself refreshes live (the board's AutoRefresh), so this stays current.
  const sugs = suggestions ?? [];
  const [sugIdx, setSugIdx] = useState(0);
  useEffect(() => {
    if (sugs.length < 2 || trimmed) return;
    const id = setInterval(() => setSugIdx((i) => (i + 1) % sugs.length), 5000);
    return () => clearInterval(id);
  }, [sugs.length, trimmed]);
  const sug = sugs.length ? sugs[sugIdx % sugs.length] : null;

  function pick(m: Mode) { setUserPicked(true); setMode(m); }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!trimmed) return;
    setSeed(trimmed);
    setSheet(mode);
  }

  // Reset the bar once a sheet closes (whether sent or cancelled).
  function onSheetToggle(v: boolean) {
    if (!v) { setSheet(null); setText(""); setUserPicked(false); }
  }

  const active = MODES.find((m) => m.key === mode)!;

  return (
    <div className="rounded-3xl bg-bg-elev p-2.5 ring-1 ring-border elevated">
      <form
        onSubmit={submit}
        className="flex items-center gap-2 rounded-2xl px-3 py-1 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40"
      >
        <Sparkles size={16} className="shrink-0 text-accent" />
        <CaretInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={active.placeholder}
          className="py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!trimmed}
          aria-label={`Create ${mode.toLowerCase()}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          <ArrowUp size={18} />
        </button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5">
        {MODES.map((m) => {
          const isActive = m.key === mode;
          const isSuggested = !userPicked && suggested === m.key && trimmed.length > 0 && !isActive;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => pick(m.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] ring-1 transition-colors ${isActive ? "bg-accent-soft text-accent ring-accent/30" : "text-fg-muted ring-border hover:text-fg"}`}
            >
              <Icon size={13} /> {m.label}
              {isSuggested && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Looks like this" />}
            </button>
          );
        })}
        {/* Team isn't a compose mode — it jumps to the people directory + reminders. */}
        <Link
          href="/portal/team"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-fg-muted ring-1 ring-border transition-colors hover:text-fg"
          title="Team directory & reminders"
        >
          <Users size={13} /> Team
        </Link>
        <span className="ml-auto hidden pr-1 text-[10px] text-fg-subtle lg:inline">↵ opens a quick form</span>
      </div>

      {/* Suggestion: rotates the top urgent tasks; tap to drop it into the bar. */}
      {sug && !trimmed && (
        <button
          type="button"
          onClick={() => { setText(sug.actionItem); pick("Task"); }}
          className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-bg-subtle/40 px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:bg-bg-subtle/70"
        >
          <Wand2 size={14} className="shrink-0 text-info" />
          <span className="min-w-0 flex-1 truncate">
            {sug.actionItem} <span className="text-fg-subtle">· {sug.companyName}</span>
          </span>
          {sugs.length > 1 && (
            <span className="flex shrink-0 items-center gap-0.5">
              {sugs.map((_, i) => (
                <span key={i} className={`h-1 w-1 rounded-full ${i === sugIdx % sugs.length ? "bg-accent" : "bg-border-strong"}`} />
              ))}
            </span>
          )}
          <CornerDownLeft size={13} className="shrink-0 text-fg-subtle" />
        </button>
      )}

      {/* Controlled sheets, pre-filled with what was typed. */}
      <DirectorTaskForm people={people} companies={companies} open={sheet === "Task"} onOpenChange={onSheetToggle} seedTitle={seed} />
      <DirectorEventForm people={people} companies={companies} open={sheet === "Event"} onOpenChange={onSheetToggle} seedTitle={seed} />
      <DirectorMessage people={people} open={sheet === "Message"} onOpenChange={onSheetToggle} seedBody={seed} />
    </div>
  );
}
