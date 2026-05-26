"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2, Bot, User, Trash2, ChevronRight, Mic, MicOff } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  taskCount?: number;
};

const SUGGESTIONS = [
  "What's overdue this week?",
  "What's blocking Dar Spices?",
  "Who has the most critical tasks?",
  "What did we close in the last 7 days?",
  "Which tasks need my attention today?",
];

export function AskCOS() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening && recRef.current) {
      recRef.current.stop();
      return;
    }
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
        // auto-submit on final transcript
        setTimeout(() => ask(transcript), 100);
      }
    };
    recRef.current = rec;
    rec.start();
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    setError(null);
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      // Send last 6 turns as memory so follow-ups work
      const recentHistory = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
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
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.answer || "(no answer)",
        taskCount: data.taskCount,
      }]);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-subtle">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-accent" />
          <span className="font-semibold text-sm">Ask COS</span>
          <span className="text-xs text-fg-muted ml-1">— ask anything about your portfolio</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-danger transition-colors"
          >
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted italic">
              Try asking about overdue items, specific companies, who's busy, or what was completed recently.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="inline-flex items-center gap-1 text-xs bg-bg-subtle hover:bg-accent/10 hover:text-accent border border-border rounded-full px-3 py-1 transition-colors"
                >
                  <ChevronRight size={10} /> {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "" : "bg-accent/5 -mx-5 px-5 py-3"}`}>
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white ${m.role === "user" ? "bg-fg-muted" : "bg-accent"}`}>
              {m.role === "user" ? <User size={12} /> : <Sparkles size={12} />}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
              {m.taskCount !== undefined && m.role === "assistant" && (
                <p className="text-xs text-fg-subtle italic">Based on {m.taskCount} relevant task{m.taskCount !== 1 ? "s" : ""}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 bg-accent/5 -mx-5 px-5 py-3">
            <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white bg-accent">
              <Sparkles size={12} />
            </div>
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 size={12} className="animate-spin" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && messages.length === 0 && (
        <div className="px-5 pb-2">
          <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
        </div>
      )}

      <form
        onSubmit={e => { e.preventDefault(); ask(input); }}
        className="flex items-center gap-2 px-5 py-3 border-t border-border bg-bg-subtle"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={listening ? "Listening…" : "Ask anything — or press the mic"}
          disabled={loading}
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={loading}
            title={listening ? "Stop listening" : "Speak"}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${
              listening
                ? "border-danger bg-danger/10 text-danger animate-pulse"
                : "border-border text-fg-muted hover:text-accent hover:border-accent/40"
            } disabled:opacity-50`}
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </form>
    </div>
  );
}
