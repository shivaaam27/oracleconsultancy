"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Zap, Loader2, Check, X as XIcon, RotateCw, CalendarPlus } from "lucide-react";
import { IntentPreview } from "./intent-preview";
import { RichAnswer } from "./rich-answer";
import { friendlyAIError } from "@/lib/ai-errors";

// A command turn: parse (confirm preview) → confirm → run, all self-managed.
export function ActionCard({
  command,
  onNavigate,
  currentView,
}: {
  command: string;
  onNavigate: (href: string) => void;
  currentView: { codes: string[]; label?: string };
}) {
  type State =
    | { phase: "loading" }
    | { phase: "preview"; intent: any }
    | { phase: "running" }
    | { phase: "done"; message: string; redirect?: string; calendarUrl?: string; googleUrl?: string }
    | { phase: "error"; message: string; retryable: boolean };
  const [state, setState] = useState<State>({ phase: "loading" });
  const ran = useRef(false);

  const activeContext = currentView.codes.length
    ? { viewCodes: currentView.codes, viewLabel: currentView.label }
    : undefined;

  const call = useCallback(async (confirm: boolean) => {
    setState(confirm ? { phase: "running" } : { phase: "loading" });
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, confirm, activeContext }),
      });
      const data = await res.json();
      if (data.needsConfirm) {
        setState({ phase: "preview", intent: data.intent });
        return;
      }
      if (data.executed || data.ok) {
        setState({ phase: "done", message: data.message || "Done", redirect: data.redirect, calendarUrl: data.calendarUrl, googleUrl: data.googleUrl });
        if (data.redirect) setTimeout(() => onNavigate(data.redirect), 900);
        return;
      }
      const fe = friendlyAIError(data.error || data.message);
      setState({ phase: "error", message: fe.message, retryable: fe.retryable });
    } catch {
      const fe = friendlyAIError("network error");
      setState({ phase: "error", message: fe.message, retryable: fe.retryable });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    call(false);
  }, [call]);

  return (
    <div className="flex items-start gap-2.5">
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-accent-soft text-accent shrink-0 mt-0.5">
        <Zap size={15} />
      </span>
      <div className="max-w-[85%] w-full rounded-2xl rounded-tl-md bg-bg-muted/60 px-3.5 py-2.5 text-sm space-y-2">
        {state.phase === "loading" && (
          <div className="flex items-center gap-2 text-fg-muted"><Loader2 size={14} className="animate-spin text-accent" /> Reading the command…</div>
        )}
        {state.phase === "preview" && (
          <>
            <div className="flex items-center gap-2 text-xs font-medium text-warn"><Zap size={12} /> Confirm action</div>
            <IntentPreview intent={state.intent} />
            <div className="flex gap-2 pt-0.5">
              <button onClick={() => call(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity">
                <Check size={12} /> Confirm
              </button>
              <button onClick={() => setState({ phase: "done", message: "Cancelled." })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors">
                <XIcon size={12} /> Cancel
              </button>
            </div>
          </>
        )}
        {state.phase === "running" && (
          <div className="flex items-center gap-2 text-fg-muted"><Loader2 size={14} className="animate-spin text-accent" /> Running…</div>
        )}
        {state.phase === "done" && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-fg"><Check size={15} className="text-success mt-0.5 shrink-0" /> <RichAnswer text={state.message} /></div>
            {(state.calendarUrl || state.googleUrl) && (
              <div className="flex flex-wrap gap-1.5 pl-7">
                {state.calendarUrl && (
                  <a href={state.calendarUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev/60 px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-accent-soft hover:border-accent/30 transition-colors">
                    <CalendarPlus size={13} className="text-accent" /> Add to calendar
                  </a>
                )}
                {state.googleUrl && (
                  <a href={state.googleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev/60 px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-accent-soft hover:border-accent/30 transition-colors">
                    <CalendarPlus size={13} className="text-accent" /> Google Calendar
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        {state.phase === "error" && (
          <div className="space-y-2 text-danger">
            <p>{state.message}</p>
            {state.retryable && (
              <button onClick={() => call(false)} className="inline-flex items-center gap-1.5 text-xs font-medium text-fg hover:text-accent transition-colors">
                <RotateCw size={12} /> Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
