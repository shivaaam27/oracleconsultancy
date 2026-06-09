"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Bot, User, Trash2, Zap, Check, X as XIcon, FileText, ChevronDown, ChevronRight, Ban, Flame, ArrowUp, Plus, StickyNote } from "lucide-react";
import { LinkifiedAnswer } from "./linkified-answer";
import { IntentPreview } from "./intent-preview";
import { CopyButton } from "./copy-button";
import { VoiceButton } from "./voice-button";
import type { PageContext } from "@/lib/page-context";
import { suggestionsFor } from "@/lib/page-suggestions";
import { useCurrentView } from "@/lib/current-view";
import { TodayBrief } from "./today-brief";
import { BRAND_NAME } from "@/lib/brand";

type Message = {
  id: string;
  role: "user" | "assistant" | "action";
  content: string;
  taskCount?: number;
  // for action messages:
  intent?: any;
  status?: "preview" | "running" | "done" | "error";
  resultMessage?: string;
  redirect?: string;
  // for digest messages:
  kind?: "digest";
  digestText?: string;
  narrative?: string;
};

// Detect if a message is a command vs a question
function looksLikeCommand(text: string): boolean {
  return /^(mark|make|complete|finish|close|escalate|create|add|update|set|change|open|go to|navigate|show me task|delete|remove|assign|reassign|prepare|build)/i.test(text.trim());
}

// Detect a request for the weekly digest / briefing
function looksLikeDigest(text: string): boolean {
  return /\b(digest|weekly (brief|briefing|summary|update|report)|exec(utive)? (brief|briefing|summary))\b/i.test(text.trim());
}

// Pull a company name out of "digest for X" / "digest of X"
function extractDigestCompany(text: string): string | null {
  const m = text.match(/\b(?:for|of|on)\s+([A-Za-z0-9'&.\- ]+?)\s*[?.!]*$/i);
  const name = m?.[1]?.trim();
  if (!name) return null;
  // Ignore generic tails so "digest for this week" stays group-wide
  if (/^(this|the|last|next|past)\b/i.test(name) || /\bweek\b/i.test(name)) return null;
  return name;
}

export function AskCOS({
  embedded = false,
  pageContext,
  operatorName,
}: { embedded?: boolean; minimal?: boolean; pageContext?: PageContext; operatorName?: string } = {}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedTask, setFocusedTask] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dictatedRef = useRef("");
  const currentView = useCurrentView();

  // Greeting (name from Settings) — rotates a little so it feels alive.
  const greeting = (() => {
    const name = (operatorName || "").trim();
    const lines = name
      ? [`Good to see you, ${name}.`, `Hi ${name} — what's the plan?`, `Ready when you are, ${name}.`]
      : ["How can I help?", "What shall we tackle?", "Ask me anything."];
    return lines[new Date().getDate() % lines.length];
  })();

  // Context-aware suggestions: tailor starter prompts to the page AND subsection.
  const suggestions = suggestionsFor(pageContext);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // On a task page, focus that task so pronouns ("escalate it") work immediately.
  useEffect(() => {
    if (pageContext?.taskCode) setFocusedTask(pageContext.taskCode);
  }, [pageContext?.taskCode]);

  // A suggestion tapped from the floating reveal opens the panel and runs its
  // prompt. The reveal dispatches `cos:ask` right after opening the assistant.
  useEffect(() => {
    const h = (e: Event) => {
      const q = (e as CustomEvent).detail?.q;
      if (typeof q === "string" && q.trim()) void submit(q);
    };
    window.addEventListener("cos:ask", h);
    return () => window.removeEventListener("cos:ask", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Dictation: live captions stream into the box; the accurate transcript replaces
  // it on stop, then auto-submits.
  function handleVoiceInterim(text: string) {
    setInput(dictatedRef.current ? `${dictatedRef.current} ${text}` : text);
  }
  function handleVoiceResult(text: string) {
    dictatedRef.current = dictatedRef.current ? `${dictatedRef.current} ${text}` : text;
    setInput(dictatedRef.current);
  }
  function handleVoiceStop() {
    const final = dictatedRef.current.trim();
    dictatedRef.current = "";
    if (final) void submit(final);
  }

  async function runAction(command: string, confirm: boolean, intentMsgId?: string) {
    try {
      const recentHistory = messages
        .filter(m => m.role !== "action")
        .slice(-4)
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          confirm,
          history: recentHistory,
          activeContext: {
            ...(focusedTask ? { taskCode: focusedTask } : pageContext?.taskCode ? { taskCode: pageContext.taskCode } : {}),
            ...(currentView.codes.length ? { viewCodes: currentView.codes, viewLabel: currentView.label } : {}),
          },
        }),
      });
      const data = await res.json();

      if (data.intent?.type === "unknown") {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, role: "assistant",
          content: `Couldn't understand: ${data.message || data.intent.reason || "unclear"}`,
        }]);
        return;
      }

      if (data.needsConfirm) {
        // Show preview card
        setMessages(prev => [...prev, {
          id: `act-${Date.now()}`, role: "action",
          content: command,
          intent: data.intent,
          status: "preview",
        }]);
        return;
      }

      // Navigation or executed action
      if (data.executed) {
        if (intentMsgId) {
          setMessages(prev => prev.map(m => m.id === intentMsgId ? { ...m, status: "done", resultMessage: data.message } : m));
        } else {
          setMessages(prev => [...prev, {
            id: `act-${Date.now()}`, role: "action",
            content: command,
            intent: data.intent,
            status: "done",
            resultMessage: data.message,
            redirect: data.redirect,
          }]);
        }
        if (data.intent?.taskCode) setFocusedTask(data.intent.taskCode);
        if (data.redirect && data.intent?.type === "navigate") {
          setTimeout(() => router.push(data.redirect), 400);
        } else if (data.intent?.type !== "navigate") {
          // A mutation landed — refresh so the list/drawer (and the published
          // current-view) reflect the change without a manual reload.
          router.refresh();
        }
        return;
      }

      // Failure
      const failMsg = data.message || "Command failed";
      if (intentMsgId) {
        setMessages(prev => prev.map(m => m.id === intentMsgId ? { ...m, status: "error", resultMessage: failMsg } : m));
      } else {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, role: "assistant", content: `⚠️ ${failMsg}`,
        }]);
      }
    } catch {
      setError("Network error. Try again.");
    }
  }

  async function runAsk(question: string) {
    try {
      const recentHistory = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .slice(-6)
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: recentHistory, pageContext }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error === "AI not configured" ? "AI not configured." : data.error || `HTTP ${res.status}`;
        setError(errMsg);
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: `⚠️ ${errMsg}` }]);
        return;
      }
      const data = await res.json();
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`, role: "assistant",
        content: data.answer || "(no answer)",
        taskCount: data.taskCount,
      }]);
    } catch {
      setError("Network error. Try again.");
    }
  }

  async function runDigest(question: string) {
    try {
      const company = extractDigestCompany(question);
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company }),
      });
      if (!res.ok) {
        setError("Could not build the digest.");
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: "⚠️ Could not build the digest." }]);
        return;
      }
      const data = await res.json();
      const scopeLabel = data.scopeName ? `${data.scopeName} · ` : `${BRAND_NAME} · `;

      // Try to enrich with an AI executive narrative (degrades gracefully).
      let narrative = "";
      try {
        const nres = await fetch("/api/digest-narrative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stats: data.stats }),
        });
        const ndata = await nres.json();
        if (ndata?.result) narrative = ndata.result;
      } catch { /* narrative is optional */ }

      setMessages(prev => [...prev, {
        id: `dg-${Date.now()}`,
        role: "assistant",
        kind: "digest",
        content: `${scopeLabel}weekly digest`,
        digestText: data.text,
        narrative,
      }]);
    } catch {
      setError("Network error. Try again.");
    }
  }

  async function submit(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setError(null);
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: q };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      if (looksLikeDigest(q)) {
        await runDigest(q);
      } else if (looksLikeCommand(q)) {
        await runAction(q, false);
      } else {
        await runAsk(q);
      }
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setMessages([]);
    setError(null);
    setFocusedTask(null);
  }

  // ＋ menu actions
  function attachContext() {
    setPlusOpen(false);
    if (pageContext?.taskCode) setFocusedTask(pageContext.taskCode);
    else if (pageContext?.companyId) setInput((v) => (v ? v : "About this company: "));
  }
  function goNewTask() { setPlusOpen(false); router.push("/task/new"); }
  function goNewNote() { setPlusOpen(false); router.push("/workbook?tab=notes"); }

  async function confirmAction(msg: Message) {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: "running" } : m));
    await runAction(msg.content, true, msg.id);
  }

  function cancelAction(msgId: string) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: "error", resultMessage: "Cancelled" } : m));
  }

  return (
    <div className={embedded ? "flex flex-col h-full min-h-0" : "card overflow-hidden"}>
      {!embedded && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-subtle">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-accent" />
            <span className="font-semibold text-sm">Ask AUMIO</span>
            <span className="text-xs text-fg-muted ml-1">— ask or command, click results to navigate</span>
          </div>
          <div className="flex items-center gap-2">
            {focusedTask && (
              <span className="text-[10px] font-mono bg-accent/10 text-accent rounded-full px-2 py-0.5">
                focused: {focusedTask}
              </span>
            )}
            {messages.length > 0 && (
              <button
                onClick={clear}
                className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-danger transition-colors"
              >
                <Trash2 size={11} /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {embedded && messages.length > 0 && (
        <div className="flex items-center justify-end px-3 pt-2 shrink-0">
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors"
          >
            <Trash2 size={11} /> New chat
          </button>
        </div>
      )}

      <div ref={scrollRef} className={`${embedded ? "flex-1 min-h-0" : "max-h-[420px]"} overflow-y-auto px-5 py-4 space-y-4`}>
        {messages.length === 0 && (
          // ChatGPT-style home: greeting, then suggestion pills below.
          <div className="h-full flex flex-col items-center justify-center text-center gap-5 py-6">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight px-4">{greeting}</h2>

            {/* Proactive: what needs a decision today. */}
            <TodayBrief onAsk={(q) => submit(q)} />


            {/* Agentic quick actions on the focused task — fire real commands
                through the same confirm pipeline as typed commands. */}
            {pageContext?.taskCode && (
              <div className="w-full max-w-md space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-fg-subtle">Quick actions · {pageContext.taskCode}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    { label: "Complete", cmd: `complete ${pageContext.taskCode}`, icon: Check },
                    { label: "Escalate", cmd: `escalate ${pageContext.taskCode}`, icon: Flame },
                    { label: "Mark blocked", cmd: `set ${pageContext.taskCode} to Blocked`, icon: Ban },
                  ].map((a) => {
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.label}
                        onClick={() => submit(a.cmd)}
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent bg-accent-soft/60 ring-1 ring-accent/30 hover:bg-accent-soft rounded-full px-3 py-1.5 transition-colors"
                      >
                        <Icon size={14} className="shrink-0" strokeWidth={2} />
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {suggestions.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.q}
                    onClick={() => submit(s.q)}
                    className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted bg-bg-elev hover:text-accent hover:border-accent/40 border border-border rounded-full px-3 py-1.5 transition-colors"
                  >
                    <Icon size={14} className="shrink-0" strokeWidth={1.9} />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map(m => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex gap-3">
                <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white bg-fg-muted">
                  <User size={12} />
                </div>
                <p className="flex-1 text-sm">{m.content}</p>
              </div>
            );
          }

          if (m.role === "assistant" && m.kind === "digest") {
            return <DigestMessage key={m.id} content={m.content} narrative={m.narrative} digestText={m.digestText || ""} />;
          }

          if (m.role === "assistant") {
            return (
              <div key={m.id} className="flex gap-3 bg-accent/5 -mx-5 px-5 py-3">
                <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white bg-accent">
                  <Sparkles size={12} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <LinkifiedAnswer
                    text={m.content}
                    onFocusTask={code => setFocusedTask(code)}
                  />
                  {m.taskCount !== undefined && (
                    <p className="text-xs text-fg-subtle italic">Based on {m.taskCount} relevant task{m.taskCount !== 1 ? "s" : ""}</p>
                  )}
                </div>
              </div>
            );
          }

          // action
          return (
            <div key={m.id} className="flex gap-3 bg-warn/5 -mx-5 px-5 py-3">
              <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white bg-warn">
                <Zap size={12} />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs font-medium text-warn flex items-center gap-1.5">
                  Command: <span className="font-mono text-fg italic">"{m.content}"</span>
                </p>
                {m.status === "preview" && m.intent && (
                  <>
                    <IntentPreview intent={m.intent} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => confirmAction(m)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        <Check size={12} /> Confirm
                      </button>
                      <button
                        onClick={() => cancelAction(m.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors"
                      >
                        <XIcon size={12} /> Cancel
                      </button>
                    </div>
                  </>
                )}
                {m.status === "running" && (
                  <p className="text-xs text-fg-muted flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Running…
                  </p>
                )}
                {m.status === "done" && (
                  <p className="text-xs text-success flex items-center gap-1.5">
                    <Check size={12} /> {m.resultMessage}
                  </p>
                )}
                {m.status === "error" && (
                  <p className="text-xs text-danger">{m.resultMessage}</p>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3 bg-accent/5 -mx-5 px-5 py-3">
            <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white bg-accent">
              <Sparkles size={12} />
            </div>
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 size={12} className="animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      {error && messages.length === 0 && (
        <div className="px-5 pb-2 shrink-0">
          <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
        </div>
      )}

      {/* Context chip — what the question is about, with a clear */}
      {embedded && focusedTask && (
        <div className="px-3 pb-1 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] bg-accent/10 text-accent rounded-full pl-2.5 pr-1 py-0.5">
            Asking about {focusedTask}
            <button type="button" onClick={() => setFocusedTask(null)} aria-label="Clear context" className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-accent/20"><XIcon size={11} /></button>
          </span>
        </div>
      )}

      {/* ChatGPT-style input pill, pinned to the bottom — ＋ · mic · send */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <div className="relative flex items-end gap-1 rounded-[1.6rem] border border-border bg-bg-elev px-1.5 py-1.5 shadow-sm transition-colors focus-within:border-accent/50">
          <div className="relative shrink-0">
            <button type="button" onClick={() => setPlusOpen((o) => !o)} aria-label="Quick actions" className="inline-flex items-center justify-center w-9 h-9 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors">
              <Plus size={18} />
            </button>
            {plusOpen && (
              <>
                <button type="button" aria-hidden className="fixed inset-0 z-[1] cursor-default" onClick={() => setPlusOpen(false)} />
                <div className="absolute bottom-full mb-2 left-0 z-[2] min-w-[190px] glass glass-menu rounded-xl p-1 shadow-lg">
                  <button type="button" onClick={attachContext} className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-left rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"><FileText size={15} /> Attach this page</button>
                  <button type="button" onClick={goNewTask} className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-left rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"><Plus size={15} /> New task</button>
                  <button type="button" onClick={goNewNote} className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-left rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"><StickyNote size={15} /> New note</button>
                </div>
              </>
            )}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(input); }
            }}
            rows={1}
            disabled={loading}
            placeholder="Ask anything…"
            className="flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] leading-snug outline-none placeholder:text-fg-muted max-h-32"
          />
          <VoiceButton disabled={loading} onInterim={handleVoiceInterim} onResult={handleVoiceResult} onStop={handleVoiceStop} title="Speak to AUMIO" />
          <button
            type="button"
            onClick={() => submit(input)}
            disabled={loading || !input.trim()}
            title="Send"
            className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-accent text-accent-fg disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function DigestMessage({ content, narrative, digestText }: { content: string; narrative?: string; digestText: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-3 bg-accent/5 -mx-5 px-5 py-3">
      <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white bg-accent">
        <FileText size={12} />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">{content}</p>
          <CopyButton text={digestText} label="Copy" />
        </div>

        {narrative && (
          <div className="bg-bg-subtle border border-border rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {narrative}
          </div>
        )}

        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {open ? "Hide" : "Show"} full digest
        </button>

        {open && (
          <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap text-fg-muted bg-bg-subtle rounded-lg p-3 overflow-auto max-h-[50vh]">
            {digestText}
          </pre>
        )}
      </div>
    </div>
  );
}
