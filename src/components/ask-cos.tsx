"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send, Loader2, Bot, User, Trash2, Mic, MicOff, Zap, Check, X as XIcon, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { LinkifiedAnswer } from "./linkified-answer";
import { PromptBox } from "./prompt-box";
import { CopyButton } from "./copy-button";

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

const SUGGESTIONS: { title: string; sub: string; q: string }[] = [
  { title: "Weekly digest", sub: "for the group", q: "Give me this week's digest" },
  { title: "What's overdue", sub: "this week?", q: "What's overdue this week?" },
  { title: "What's blocking", sub: "Dar Spices?", q: "What's blocking Dar Spices?" },
  { title: "Who has the most", sub: "critical tasks?", q: "Who has the most critical tasks?" },
];

// Detect if a message is a command vs a question
function looksLikeCommand(text: string): boolean {
  return /^(mark|complete|finish|close|escalate|create|add|update|set|change|open|go to|navigate|show me task|delete|remove|assign|reassign)/i.test(text.trim());
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

export function AskCOS({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [focusedTask, setFocusedTask] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening && recRef.current) { recRef.current.stop(); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e: any) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        rec.stop();
        setTimeout(() => submit(transcript), 100);
      }
    };
    recRef.current = rec;
    rec.start();
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
          activeContext: focusedTask ? { taskCode: focusedTask } : undefined,
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
        body: JSON.stringify({ question, history: recentHistory }),
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
      const scopeLabel = data.scopeName ? `${data.scopeName} · ` : "Oracle Group · ";

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

  async function confirmAction(msg: Message) {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: "running" } : m));
    await runAction(msg.content, true, msg.id);
  }

  function cancelAction(msgId: string) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: "error", resultMessage: "Cancelled" } : m));
  }

  return (
    <div className={embedded ? "flex flex-col" : "card overflow-hidden"}>
      {!embedded && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-subtle">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-accent" />
            <span className="font-semibold text-sm">Ask COS</span>
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

      {embedded && (focusedTask || messages.length > 0) && (
        <div className="flex items-center justify-end gap-2 px-5 pt-3">
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
      )}

      <div ref={scrollRef} className={`max-h-[420px] overflow-y-auto px-5 py-4 space-y-4 ${embedded ? "order-3" : ""}`}>
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted italic">
              Ask questions, run commands, or use pronouns once a task is focused. Try:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s.q}
                  onClick={() => submit(s.q)}
                  className="inline-flex items-center text-xs bg-bg-elev hover:bg-accent/10 hover:text-accent hover:border-accent/40 border border-border rounded-full px-3 py-1.5 transition-colors"
                >
                  {s.q}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-fg-subtle italic pt-1">
              Commands: <span className="font-mono">mark CO01-004 done</span>, <span className="font-mono">escalate it</span>, <span className="font-mono">add update to it: still waiting</span>, <span className="font-mono">open it</span>
            </p>
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
                    <pre className="text-xs bg-bg-subtle rounded px-2 py-1.5 overflow-auto font-mono">
{JSON.stringify(m.intent, null, 2)}
                    </pre>
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
        <div className={`px-5 pb-2 ${embedded ? "order-2" : ""}`}>
          <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
        </div>
      )}

      <div className={`px-5 py-3 ${embedded ? "order-1 border-b border-border" : "border-t border-border bg-bg-subtle"}`}>
        <PromptBox
          value={input}
          onChange={setInput}
          onSubmit={() => submit(input)}
          disabled={loading}
          minHeight={72}
          placeholder={listening ? "Listening…" : "Ask anything — or type a command"}
          actions={
            <>
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={loading}
                  title={listening ? "Stop listening" : "Speak"}
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-all ${
                    listening
                      ? "border-danger bg-danger/10 text-danger animate-pulse"
                      : "border-border text-fg-muted hover:text-accent hover:border-accent/40"
                  } disabled:opacity-50`}
                >
                  {listening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => submit(input)}
                disabled={loading || !input.trim()}
                title="Send"
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent text-accent-fg disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </>
          }
        />
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
