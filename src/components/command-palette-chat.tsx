"use client";
import { useEffect, useState, useRef } from "react";
import { ArrowLeft, ArrowUp, ArrowRight, Sparkles, Loader2, X as XIcon, User, RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { RichAnswer } from "./rich-answer";
import { VoiceButton } from "./voice-button";
import { MagneticChip } from "./command-palette-bits";
import { ActionCard } from "./command-palette-action-card";
import { AgentCard } from "./command-palette-agent-card";

// A turn in the conversation thread.
export type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; taskCount?: number | null; meetingCount?: number | null; sourceSummary?: string | null; streaming?: boolean }
  | { id: string; role: "action"; command: string }
  | { id: string; role: "agent"; command: string }
  | { id: string; role: "error"; text: string; retry?: string };

export type Pulse = { overdue: number; dueSoon: number; critical: number; escalated: number; open: number; meetingsToday: number };

// Smart next-question chips after an answer — keeps the conversation flowing.
function followUpsFor(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  const code = text.match(/[A-Z]{2,8}\d{0,3}-\d{2,4}/);
  if (code) out.push(`Draft a follow-up message for ${code[0]}`);
  if (/overdue|late|behind|slipping/.test(t)) out.push("Who should I chase first?");
  if (/risk|blocker|blocked|stuck/.test(t)) out.push("What's the biggest risk right now?");
  if (/leave|away|off\b/.test(t)) out.push("Who is covering for them?");
  for (const g of ["What needs my attention today?", "Anything overdue this week?", "Summarise this for the board"]) {
    if (out.length >= 3) break;
    if (!out.includes(g)) out.push(g);
  }
  return out.slice(0, 3);
}

export function ConversationPane({
  thread,
  thinking,
  pageLabel,
  operatorName,
  voiceLanguage,
  suggestions,
  onSubmit,
  onRetry,
  onBack,
  onClose,
  onNavigate,
  currentView,
}: {
  thread: Msg[];
  thinking: boolean;
  pageLabel: string;
  operatorName?: string;
  voiceLanguage?: string;
  suggestions: { label: string; q: string; icon: React.ComponentType<{ size?: number; className?: string }> }[];
  onSubmit: (text: string) => void;
  onRetry: (text: string) => void;
  onBack: () => void;
  onClose: () => void;
  onNavigate: (href: string) => void;
  currentView: { codes: string[]; label?: string };
}) {
  const [input, setInput] = useState("");
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dictatedRef = useRef("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  // Proactive: pull a live snapshot so ORI opens knowing what's happening.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pulse", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setPulse(d as Pulse); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  // Escape from the conversation: clear a draft first, else step back to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (inputRef.current?.value) { setInput(""); return; }
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, thinking]);

  function send() {
    const t = input.trim();
    if (!t) return;
    setInput("");
    onSubmit(t);
  }

  const greeting = (() => {
    const name = (operatorName || "").trim().split(/\s+/)[0];
    const h = new Date().getHours();
    const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
    return name ? `Good ${part}, ${name}.` : `Good ${part}.`;
  })();

  // A one-line "what's happening" summary built from the live pulse.
  const pulseLine = (() => {
    if (!pulse) return null;
    const bits: string[] = [];
    if (pulse.overdue) bits.push(`${pulse.overdue} overdue`);
    if (pulse.escalated) bits.push(`${pulse.escalated} escalated`);
    if (pulse.dueSoon) bits.push(`${pulse.dueSoon} due soon`);
    if (pulse.meetingsToday) bits.push(`${pulse.meetingsToday} meeting${pulse.meetingsToday !== 1 ? "s" : ""} today`);
    if (bits.length === 0) return "Everything's on track — nothing overdue or escalated right now.";
    return `Right now: ${bits.join(" · ")}.`;
  })();

  // Suggestions: lead with what the pulse says is pressing, then page-aware ones.
  const dynamicChips = (() => {
    const out: { label: string; q: string }[] = [];
    if (pulse?.overdue) out.push({ label: "Show what's overdue", q: "What's overdue this week?" });
    if (pulse?.escalated) out.push({ label: "Review escalations", q: "What's escalated and why?" });
    if (pulse?.meetingsToday) out.push({ label: "Today's meetings", q: "What meetings do I have today?" });
    for (const s of suggestions) {
      if (out.length >= 4) break;
      if (!out.some((o) => o.q === s.q)) out.push({ label: s.label, q: s.q });
    }
    return out.slice(0, 4);
  })();

  // Follow-up chips after the latest completed answer.
  const last = thread[thread.length - 1];
  const followUps = last && last.role === "assistant" && !last.streaming && !thinking ? followUpsFor(last.text) : [];

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to search"
          className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-accent-soft text-accent shrink-0">
          <Sparkles size={15} />
        </span>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="font-semibold text-sm tracking-tight">ORI</span>
          <span className="text-[10px] text-fg-muted truncate">{pageLabel}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
        >
          <XIcon size={16} />
        </button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4">
        {thread.length === 0 && (
          <div className="space-y-4">
            <div data-stagger className="flex items-start gap-2.5">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-accent-soft text-accent shrink-0 mt-0.5">
                <Sparkles size={15} />
              </span>
              <div className="text-sm leading-relaxed text-fg">
                <p>{greeting} {pulseLine ? <span className="text-fg-muted">{pulseLine}</span> : "Ask me anything about your portfolio, or type a command."}</p>
                {pulseLine && <p className="text-fg-muted mt-1">What would you like to do?</p>}
              </div>
            </div>
            <div data-stagger className="flex flex-wrap gap-1.5">
              {dynamicChips.map((s) => (
                <MagneticChip
                  key={s.q}
                  onClick={() => onSubmit(s.q)}
                  className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-border/60 bg-bg-elev/60 px-3 py-1.5 text-[13px] text-fg hover:bg-accent-soft hover:ring-accent/30 transition-colors"
                >
                  <Sparkles size={13} className="text-accent" />
                  {s.label}
                </MagneticChip>
              ))}
            </div>
          </div>
        )}

        {thread.map((m) => (
          <MessageBubble key={m.id} msg={m} onRetry={onRetry} onNavigate={onNavigate} currentView={currentView} />
        ))}

        {thinking && (
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 size={14} className="animate-spin text-accent" /> Thinking…
          </div>
        )}

        {/* Proactive follow-ups under the latest answer. */}
        {followUps.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {followUps.map((f) => (
              <MagneticChip
                key={f}
                onClick={() => onSubmit(f)}
                className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-border/60 bg-bg-elev/40 px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg hover:bg-accent-soft hover:ring-accent/30 transition-colors"
              >
                <ArrowRight size={12} className="text-accent" />
                {f}
              </MagneticChip>
            ))}
          </div>
        )}
      </div>

      {/* Composer — one open, soft field (no box-in-box). */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <div className="composer-field flex items-end gap-2 px-4 py-2.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask a question or type a command…"
            className="flex-1 resize-none !bg-transparent !border-0 !shadow-none !rounded-none px-0 py-1 text-[15px] leading-6 min-h-[2rem] max-h-32 focus:outline-none focus:!ring-0 placeholder:text-fg-subtle"
          />
          <VoiceButton
            lang={voiceLanguage}
            onInterim={(t) => setInput((dictatedRef.current + " " + t).trim())}
            onResult={(t) => { dictatedRef.current = (dictatedRef.current + " " + t).trim(); setInput(dictatedRef.current); }}
            onStop={() => { dictatedRef.current = input; }}
            className="shrink-0"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim()}
            aria-label="Send"
            className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full bg-accent text-white disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all"
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </div>
    </>
  );
}

function MessageBubble({
  msg,
  onRetry,
  onNavigate,
  currentView,
}: {
  msg: Msg;
  onRetry: (text: string) => void;
  onNavigate: (href: string) => void;
  currentView: { codes: string[]; label?: string };
}) {
  if (msg.role === "user") {
    return (
      <div className="flex items-start gap-2.5 justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-accent text-white px-3.5 py-2 text-sm leading-relaxed">
          {msg.text}
        </div>
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-bg-muted text-fg-muted shrink-0 mt-0.5">
          <User size={14} />
        </span>
      </div>
    );
  }
  if (msg.role === "assistant") {
    return (
      <div className="flex items-start gap-2.5">
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-accent-soft text-accent shrink-0 mt-0.5">
          <Sparkles size={15} />
        </span>
        <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-bg-muted/60 px-3.5 py-2.5">
          <RichAnswer text={msg.text} withActions={!msg.streaming} />
          {msg.streaming && (
            <span className="inline-block w-1.5 h-3.5 -mb-0.5 ml-0.5 bg-accent/70 rounded-sm animate-pulse" aria-hidden />
          )}
          {!msg.streaming && msg.sourceSummary ? (
            <div className="mt-1.5 text-[10px] text-fg-subtle">based on {msg.sourceSummary}</div>
          ) : (!msg.streaming && msg.taskCount != null && (
            <div className="mt-1.5 text-[10px] text-fg-subtle">based on {msg.taskCount} task{msg.taskCount !== 1 ? "s" : ""}{msg.meetingCount ? ` · ${msg.meetingCount} meeting${msg.meetingCount !== 1 ? "s" : ""}` : ""}</div>
          ))}
        </div>
      </div>
    );
  }
  if (msg.role === "error") {
    return (
      <div className="flex items-start gap-2.5">
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-danger/10 text-danger shrink-0 mt-0.5">
          <XIcon size={15} />
        </span>
        <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-danger/5 border border-danger/30 px-3.5 py-2.5 text-sm text-danger space-y-2">
          <p>{msg.text}</p>
          {msg.retry && (
            <button
              type="button"
              onClick={() => onRetry(msg.retry!)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-fg hover:text-accent transition-colors"
            >
              <RotateCw size={12} /> Try again
            </button>
          )}
        </div>
      </div>
    );
  }
  if (msg.role === "agent") {
    return <AgentCard command={msg.command} onNavigate={onNavigate} />;
  }
  // action
  return <ActionCard command={msg.command} onNavigate={onNavigate} currentView={currentView} />;
}
