"use client";
import { Command } from "cmdk";
import { useEffect, useState, createContext, useContext, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowRight, Pin, PinOff, Search, Clock, Star, Sparkles, Bot, Zap, Loader2, Check, X as XIcon, CheckCircle2, AlertOctagon, MessageSquarePlus, FilePlus2, ArrowLeft, ArrowUp, RotateCw, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ROUTES, ROUTE_BY_ID } from "@/lib/nav";
import { usePins } from "@/lib/use-pins";
import { IntentPreview } from "./intent-preview";
import { LinkifiedAnswer } from "./linkified-answer";
import { VoiceButton } from "./voice-button";
import { derivePageContext } from "@/lib/page-context";
import { suggestionsFor } from "@/lib/page-suggestions";
import { useCurrentView } from "@/lib/current-view";
import { friendlyAIError } from "@/lib/ai-errors";

type Ctx = { open: () => void; close: () => void; ask: (q: string) => void };
const CommandCtx = createContext<Ctx>({ open: () => {}, close: () => {}, ask: () => {} });
export const useCommandPalette = () => useContext(CommandCtx);

type SearchItem = { code: string; label: string; sub: string; href: string; status: string; flag: string };

// A turn in the conversation thread.
type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; taskCount?: number | null }
  | { id: string; role: "action"; command: string }
  | { id: string; role: "error"; text: string; retry?: string };

let msgSeq = 0;
const newId = () => `m${++msgSeq}`;

// Which natural-language inputs are commands (mutations / navigations) vs
// free-text questions. Commands go to /api/action, questions to /api/ask.
function looksLikeCommand(text: string): boolean {
  return /^(mark|complete|finish|close|escalate|create|add|update|set|change|open|go to|navigate|show me task|delete|remove|assign|reassign|remind|chase|nudge|ping|message|tell|notify|let|send|follow[\s-]?up|reach out|draft|prepare|generate|build)\b/i.test(
    text.trim(),
  );
}
// "who is missing a passport" / "who is on leave" are handled deterministically
// by /api/action, so route them there even though they read as questions.
function isDeterministicQuery(text: string): boolean {
  const t = text.trim();
  const missing =
    /\b(missing|without|doesn'?t have|don'?t have|lacks?|haven'?t)\b/i.test(t) &&
    /\b(who|which|anyone|everyone|list|staff|people|employees?)\b/i.test(t);
  const leave =
    /\b(on leave|off (?:today|this week|work)|who'?s off|away (?:today|this week))\b/i.test(t) &&
    !/\b(log|book|request|apply|how (?:much|many)|balance|entitle|remaining|left)\b/i.test(t);
  return missing || leave;
}

export function CommandPaletteProvider({
  children,
  operatorName,
}: {
  children: React.ReactNode;
  operatorName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "chat">("search");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [thread, setThread] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const { pins, toggle } = usePins();
  const router = useRouter();
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const currentView = useCurrentView();
  const pageContext = derivePageContext(pathname, searchParams);
  // The staff portal and sign-in screens must not expose admin-wide search.
  const onPortal = pathname.startsWith("/portal") || pathname === "/login";

  const threadRef = useRef<Msg[]>([]);
  threadRef.current = thread;

  // ⌘K / Ctrl+K hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!onPortal) setIsOpen((o) => !o);
      }
      // ESC closes from search mode (chat mode handles its own back-step).
      if (e.key === "Escape") setIsOpen((o) => (o && mode === "search" ? false : o));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPortal, mode]);

  // External triggers (nav AI chip, suggestion reveal, /ask redirect).
  useEffect(() => {
    if (onPortal) return;
    const onOpen = (e: Event) => {
      setIsOpen(true);
      if ((e as CustomEvent).detail?.full) setMode("chat");
    };
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent).detail?.q;
      if (typeof q === "string" && q.trim()) {
        setIsOpen(true);
        // Defer so the panel is mounted before we run the prompt.
        setTimeout(() => submitPrompt(q.trim()), 30);
      }
    };
    window.addEventListener("cos:assistant", onOpen);
    window.addEventListener("cos:ask", onAsk);
    return () => {
      window.removeEventListener("cos:assistant", onOpen);
      window.removeEventListener("cos:ask", onAsk);
    };
    // submitPrompt is stable enough for this listener's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPortal]);

  // Fetch recents whenever palette opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch("/api/prefs/nav-recents", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { recents: [] }))
      .then((d) => {
        if (!cancelled && Array.isArray(d.recents)) {
          setRecents(d.recents.filter((id: string) => ROUTE_BY_ID[id]));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Server search (tasks) — only while in search mode.
  useEffect(() => {
    if (!isOpen || mode !== "search") return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setItems(data.items || []);
      } catch {}
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, isOpen, mode]);

  // Reset everything on close.
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setMode("search");
      setThread([]);
      setThinking(false);
    }
  }, [isOpen]);

  const trimmed = query.trim();
  const routeToAction = looksLikeCommand(trimmed) || isDeterministicQuery(trimmed);

  // ---- Conversation engine (reuses /api/ask + /api/action) --------------

  function append(msg: Msg) {
    setThread((t) => [...t, msg]);
  }

  // History the AI sees (user + assistant turns only).
  function aiHistory(): { role: "user" | "assistant"; content: string }[] {
    return threadRef.current
      .filter((m): m is Extract<Msg, { role: "user" | "assistant" }> => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));
  }

  async function runAsk(text: string) {
    setThinking(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          history: aiHistory(),
          pageContext: { label: pageContext.label, taskCode: pageContext.taskCode, companyId: pageContext.companyId },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const fe = friendlyAIError(data.error || `groq-${res.status}`);
        append({ id: newId(), role: "error", text: fe.message, retry: fe.retryable ? text : undefined });
        return;
      }
      append({ id: newId(), role: "assistant", text: data.answer || "(no answer)", taskCount: data.taskCount ?? null });
    } catch {
      append({ id: newId(), role: "error", text: friendlyAIError("network error").message, retry: text });
    } finally {
      setThinking(false);
    }
  }

  // Commands surface as their own self-managed ActionCard (confirm → run).
  function runCommand(text: string) {
    append({ id: newId(), role: "action", command: text });
  }

  // Entry point for every conversational turn.
  function submitPrompt(text: string) {
    const t = text.trim();
    if (!t) return;
    setMode("chat");
    setQuery("");
    append({ id: newId(), role: "user", text: t });
    if (looksLikeCommand(t) || isDeterministicQuery(t)) runCommand(t);
    else runAsk(t);
  }

  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href);
    },
    [router],
  );

  // Build route groups
  const pinnedRoutes = pins.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
  const recentRoutes = recents
    .filter((id) => !pins.includes(id))
    .map((id) => ROUTE_BY_ID[id])
    .filter(Boolean)
    .slice(0, 5);
  const otherRoutes = NAV_ROUTES.filter(
    (r) => !pins.includes(r.id) && !recentRoutes.some((rr) => rr.id === r.id),
  );

  return (
    <CommandCtx.Provider
      value={{
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        ask: (q: string) => {
          setIsOpen(true);
          setTimeout(() => submitPrompt(q), 30);
        },
      }}
    >
      {children}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              layout
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 480, damping: 34 }}
              className={cn(
                "relative w-full glass rounded-2xl shadow-lg overflow-hidden flex flex-col",
                mode === "chat" ? "max-w-2xl h-[72vh] max-h-[680px]" : "max-w-xl",
              )}
            >
              {mode === "chat" ? (
                <ConversationPane
                  thread={thread}
                  thinking={thinking}
                  pageLabel={pageContext.label}
                  operatorName={operatorName}
                  suggestions={suggestionsFor(pageContext)}
                  onSubmit={submitPrompt}
                  onRetry={(t) => { append({ id: newId(), role: "user", text: t }); if (looksLikeCommand(t) || isDeterministicQuery(t)) runCommand(t); else runAsk(t); }}
                  onBack={() => { setMode("search"); setThread([]); }}
                  onClose={() => setIsOpen(false)}
                  onNavigate={(href) => { setIsOpen(false); router.push(href); }}
                  currentView={currentView}
                />
              ) : (
                <Command shouldFilter={true} loop>
                  <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border">
                    <Search size={16} className="text-fg-subtle shrink-0" />
                    <Command.Input
                      autoFocus
                      value={query}
                      onValueChange={setQuery}
                      onKeyDown={(e) => {
                        // Enter on a non-empty query with no highlighted item → conversation.
                        if (e.key === "Enter" && trimmed && !e.defaultPrevented) {
                          const selected = document.querySelector('[cmdk-item][aria-selected="true"]');
                          const isAffordance = selected?.getAttribute("data-ai") === "1";
                          if (!selected || isAffordance) {
                            e.preventDefault();
                            submitPrompt(trimmed);
                          }
                        }
                      }}
                      placeholder="Search, ask AUMIO, or type a command…"
                      className="flex-1 w-full min-w-0 !bg-transparent !border-0 !rounded-none !shadow-none text-[15px] leading-6 focus:outline-none focus:!shadow-none focus:!ring-0 placeholder:text-fg-subtle"
                    />
                    <kbd className="shrink-0 text-[10px] font-mono text-fg-subtle border border-border rounded-md px-1.5 py-0.5">
                      ESC
                    </kbd>
                  </div>
                  <Command.List className="max-h-[460px] overflow-y-auto p-1.5">
                    <Command.Empty className="py-8 text-center text-sm text-fg-muted">
                      {trimmed ? "Hit ↵ to ask AUMIO or run this command." : "No results."}
                    </Command.Empty>

                    {/* AI affordance — Enter routes to conversation. */}
                    {trimmed.length >= 2 && (
                      <Command.Group
                        heading="AUMIO"
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        <Command.Item
                          value={`__ai__ ${trimmed}`}
                          data-ai="1"
                          onSelect={() => submitPrompt(trimmed)}
                          className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-accent/10"
                        >
                          {routeToAction ? <Zap size={14} className="text-accent" /> : <Sparkles size={14} className="text-accent" />}
                          <span className="flex-1 truncate">
                            {routeToAction ? "Run command" : "Ask AUMIO"}: <span className="text-fg-muted italic">"{trimmed}"</span>
                          </span>
                          <kbd className="text-[10px] font-mono text-fg-subtle">↵</kbd>
                        </Command.Item>
                      </Command.Group>
                    )}

                    {/* Quick actions — launchpad (empty query only) */}
                    {!trimmed && (
                      <Command.Group
                        heading="Quick actions"
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        <Command.Item
                          value="__qa ask aumio assistant"
                          onSelect={() => { setMode("chat"); }}
                          className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                        >
                          <Sparkles size={14} className="text-accent" />
                          <span className="flex-1">Ask AUMIO</span>
                          <kbd className="text-[10px] font-mono text-fg-subtle">↵</kbd>
                        </Command.Item>
                        <Command.Item
                          value="__qa new task create"
                          onSelect={() => go("/task/new")}
                          className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                        >
                          <Plus size={14} className="text-accent" />
                          <span className="flex-1">New Task</span>
                        </Command.Item>
                        <Command.Item
                          value="__qa capture quick"
                          onSelect={() => go("?capture=open")}
                          className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                        >
                          <FilePlus2 size={14} className="text-accent" />
                          <span className="flex-1">Quick Capture</span>
                        </Command.Item>
                      </Command.Group>
                    )}

                    {/* Try a command — discoverable natural-language prompts. */}
                    {!trimmed && (
                      <Command.Group
                        heading="Try asking"
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        {[
                          { icon: <Sparkles size={14} className="text-accent" />, label: "Plan my day", q: "Plan my day" },
                          { icon: <Zap size={14} className="text-accent" />, label: "Draft the Director Brief for this month", q: "draft brief for this month" },
                          { icon: <MessageSquarePlus size={14} className="text-accent" />, label: "Who is missing a passport?", q: "who is missing a passport" },
                        ].map((ex) => (
                          <Command.Item
                            key={ex.q}
                            value={`__try ${ex.label}`}
                            onSelect={() => submitPrompt(ex.q)}
                            className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                          >
                            {ex.icon}
                            <span className="flex-1 text-fg-muted">{ex.label}</span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}

                    {/* Tasks (from server search) */}
                    {items.length > 0 && (
                      <Command.Group
                        heading={trimmed ? "Tasks" : "Recent tasks"}
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        {items.map((it) => (
                          <SearchTaskRow
                            key={it.code}
                            item={it}
                            onOpen={() => go(it.href)}
                            onClose={() => setIsOpen(false)}
                          />
                        ))}
                      </Command.Group>
                    )}

                    {/* Pinned */}
                    {pinnedRoutes.length > 0 && (
                      <RouteGroup heading="Pinned" routes={pinnedRoutes} pins={pins} onGo={go} onToggle={toggle} />
                    )}

                    {/* Recents */}
                    {recentRoutes.length > 0 && (
                      <RouteGroup heading="Recent" routes={recentRoutes} pins={pins} onGo={go} onToggle={toggle} icon={<Clock size={11} />} />
                    )}

                    {/* All other pages */}
                    {otherRoutes.length > 0 && (
                      <RouteGroup heading="Pages" routes={otherRoutes} pins={pins} onGo={go} onToggle={toggle} />
                    )}
                  </Command.List>
                  <div className="border-t border-border px-3 py-2 text-[10px] text-fg-subtle flex items-center gap-3">
                    <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                    <span><kbd className="font-mono">↵</kbd> open / ask</span>
                    <span><kbd className="font-mono">⌘P</kbd> toggle pin</span>
                    <span className="ml-auto"><Star size={10} className="inline -mt-0.5" /> click to pin</span>
                  </div>
                </Command>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </CommandCtx.Provider>
  );
}

/* --------------------------------------------------------------------- */
/* Conversation pane — the expanded "Ask AUMIO" surface.                   */
/* --------------------------------------------------------------------- */

function ConversationPane({
  thread,
  thinking,
  pageLabel,
  operatorName,
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
  suggestions: { label: string; q: string; icon: React.ComponentType<{ size?: number; className?: string }> }[];
  onSubmit: (text: string) => void;
  onRetry: (text: string) => void;
  onBack: () => void;
  onClose: () => void;
  onNavigate: (href: string) => void;
  currentView: { codes: string[]; label?: string };
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dictatedRef = useRef("");

  useEffect(() => {
    inputRef.current?.focus();
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

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to search"
          className="inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-accent-soft text-accent shrink-0">
          <Sparkles size={15} />
        </span>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="font-semibold text-sm tracking-tight">AUMIO</span>
          <span className="text-[10px] text-fg-muted truncate">{pageLabel}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
        >
          <XIcon size={16} />
        </button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4">
        {thread.length === 0 && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-accent-soft text-accent shrink-0 mt-0.5">
                <Sparkles size={15} />
              </span>
              <div className="text-sm leading-relaxed text-fg">
                {greeting} Ask me anything about your portfolio, or type a command like <span className="text-fg-muted italic">"escalate DS-001"</span>.
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => onSubmit(s.q)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev/60 px-3 py-1.5 text-[13px] text-fg hover:bg-accent-soft hover:border-accent/30 transition-colors"
                  >
                    <Icon size={13} className="text-accent" />
                    {s.label}
                  </button>
                );
              })}
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
      </div>

      {/* Composer */}
      <div className="border-t border-border p-2.5 shrink-0">
        <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-bg-elev/60 px-3 py-2 focus-within:ring-1 focus-within:ring-accent/40 transition-shadow">
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
            className="flex-1 resize-none bg-transparent text-sm leading-6 max-h-28 focus:outline-none placeholder:text-fg-subtle"
          />
          <VoiceButton
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
            className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <ArrowUp size={16} />
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
          <LinkifiedAnswer text={msg.text} />
          {msg.taskCount != null && (
            <div className="mt-1.5 text-[10px] text-fg-subtle">based on {msg.taskCount} task{msg.taskCount !== 1 ? "s" : ""}</div>
          )}
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
  // action
  return <ActionCard command={msg.command} onNavigate={onNavigate} currentView={currentView} />;
}

// A command turn: parse (confirm preview) → confirm → run, all self-managed.
function ActionCard({
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
    | { phase: "done"; message: string; redirect?: string }
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
        setState({ phase: "done", message: data.message || "Done", redirect: data.redirect });
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
          <div className="flex items-start gap-2 text-fg"><Check size={15} className="text-success mt-0.5 shrink-0" /> <LinkifiedAnswer text={state.message} /></div>
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

/* --------------------------------------------------------------------- */

function SearchTaskRow({
  item,
  onOpen,
  onClose,
}: {
  item: SearchItem;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateBody, setUpdateBody] = useState("");
  const router = useRouter();

  async function runCmd(command: string, label: string, redirect?: string) {
    setRunning(label);
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, confirm: true }),
      });
      const data = await res.json();
      if (data.executed) {
        setDone(label);
        if (redirect) setTimeout(() => { onClose(); router.push(redirect); }, 400);
        else setTimeout(() => setDone(null), 1500);
      }
    } catch {}
    finally { setRunning(null); }
  }

  const flagDanger = ["overdue", "escalate-now", "escalated", "stalled"].includes(item.flag);
  const flagWarn = ["due-soon", "no-deadline", "aging"].includes(item.flag);
  const dot = flagDanger ? "bg-danger" : flagWarn ? "bg-warn" : "bg-fg-subtle";

  return (
    <div className="rounded-lg flex flex-col gap-1">
      <Command.Item
        value={`${item.code} ${item.label} ${item.sub}`}
        onSelect={onOpen}
        className="group/row px-2 py-2 rounded-lg flex items-center gap-2.5 cursor-pointer text-sm aria-selected:bg-bg-muted"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className="font-mono text-xs text-fg-muted w-[68px] shrink-0">{item.code}</span>
        <span className="flex-1 truncate">{item.label}</span>
        <span className="text-[10px] rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted shrink-0 hidden sm:inline">{item.status}</span>
        <span className="text-xs text-fg-subtle shrink-0 max-w-[110px] truncate hidden md:inline">{item.sub}</span>
        {/* Actions — revealed on hover / keyboard highlight */}
        <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/row:opacity-100 group-data-[selected=true]/row:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); runCmd(`mark ${item.code} as completed`, "complete", item.href); }}
            disabled={!!running}
            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-muted hover:text-success hover:bg-bg-elev transition-colors disabled:opacity-50"
            title="Mark complete"
          >
            {running === "complete" ? <Loader2 size={12} className="animate-spin" /> : done === "complete" ? <Check size={12} className="text-success" /> : <CheckCircle2 size={13} />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); runCmd(`escalate ${item.code}`, "escalate", item.href); }}
            disabled={!!running}
            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-muted hover:text-danger hover:bg-bg-elev transition-colors disabled:opacity-50"
            title="Escalate"
          >
            {running === "escalate" ? <Loader2 size={12} className="animate-spin" /> : done === "escalate" ? <Check size={12} className="text-danger" /> : <AlertOctagon size={13} />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowUpdate(s => !s); }}
            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-muted hover:text-accent hover:bg-bg-elev transition-colors"
            title="Add update"
          >
            <MessageSquarePlus size={13} />
          </button>
        </span>
      </Command.Item>
      {showUpdate && (
        <div className="flex items-center gap-1 pl-[88px] pb-1" onClick={(e) => e.stopPropagation()}>
          <input
            value={updateBody}
            onChange={(e) => setUpdateBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (updateBody.trim()) {
                  runCmd(`add update to ${item.code}: ${updateBody.trim()}`, "update", item.href);
                  setUpdateBody("");
                  setShowUpdate(false);
                }
              }
              if (e.key === "Escape") { setShowUpdate(false); setUpdateBody(""); }
              e.stopPropagation();
            }}
            placeholder="Type update, then Enter…"
            autoFocus
            className="flex-1 bg-bg border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (updateBody.trim()) {
                runCmd(`add update to ${item.code}: ${updateBody.trim()}`, "update", item.href);
                setUpdateBody("");
                setShowUpdate(false);
              }
            }}
            disabled={!updateBody.trim() || running === "update"}
            className="inline-flex items-center justify-center w-6 h-6 rounded bg-accent text-white disabled:opacity-50"
            title="Post update"
          >
            {running === "update" ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */

function RouteGroup({
  heading,
  routes,
  pins,
  onGo,
  onToggle,
  icon,
}: {
  heading: string;
  routes: typeof NAV_ROUTES;
  pins: string[];
  onGo: (href: string) => void;
  onToggle: (id: string) => void;
  icon?: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:gap-1.5"
    >
      {routes.map((r) => {
        const Icon = r.icon;
        const pinned = pins.includes(r.id);
        return (
          <Command.Item
            key={r.id}
            value={`${r.label} ${r.id}`}
            onSelect={() => onGo(r.href)}
            className="group/row px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
          >
            {icon ? <span className="text-fg-subtle">{icon}</span> : <Icon size={14} />}
            <span className="flex-1">{r.label}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggle(r.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={pinned ? "Unpin" : "Pin"}
              className={cn(
                "p-1 rounded-md transition-colors",
                pinned
                  ? "text-fg opacity-100"
                  : "text-fg-subtle opacity-0 group-hover/row:opacity-100 hover:text-fg"
              )}
            >
              {pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
            <ArrowRight size={12} className="opacity-40" />
          </Command.Item>
        );
      })}
    </Command.Group>
  );
}
