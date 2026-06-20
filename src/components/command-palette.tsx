"use client";
import { Command } from "cmdk";
import { useEffect, useState, createContext, useContext, useCallback, useRef, type ComponentPropsWithoutRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowRight, Pin, PinOff, Search, Clock, Star, Sparkles, Bot, Zap, Loader2, Check, X as XIcon, CheckCircle2, AlertOctagon, MessageSquarePlus, FilePlus2, ArrowLeft, ArrowUp, RotateCw, User, CalendarPlus, GitBranch } from "lucide-react";
import type { SearchResult } from "@/lib/search";
import { buildPaletteTypeMeta } from "./entity-ui";
import { Switch } from "./ui";
import { cn } from "@/lib/cn";
import { NAV_ROUTES, ROUTE_BY_ID } from "@/lib/nav";
import { usePins } from "@/lib/use-pins";
import { IntentPreview } from "./intent-preview";
import { RichAnswer } from "./rich-answer";
import { VoiceButton } from "./voice-button";
import { derivePageContext } from "@/lib/page-context";
import { suggestionsFor } from "@/lib/page-suggestions";
import { useCurrentView } from "@/lib/current-view";
import { friendlyAIError } from "@/lib/ai-errors";
import { TracePanel } from "./trace-panel";
import dynamic from "next/dynamic";

// Lazy: the WebGL aurora only loads (and only ships) once the palette opens.
const CommandBackdrop = dynamic(() => import("./command-backdrop").then((m) => m.CommandBackdrop), { ssr: false });

type Ctx = { open: () => void; close: () => void; ask: (q: string) => void };
const CommandCtx = createContext<Ctx>({ open: () => {}, close: () => {}, ask: () => {} });
export const useCommandPalette = () => useContext(CommandCtx);

type SearchItem = { code: string; label: string; sub: string; href: string; status: string; flag: string };

// A turn in the conversation thread.
type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; taskCount?: number | null; meetingCount?: number | null; sourceSummary?: string | null; streaming?: boolean }
  | { id: string; role: "action"; command: string }
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

// Deep-index result types → heading, row icon, and accent colour. Derived from
// the entity registry (label/order) + ENTITY_UI (icon/tint) via buildPaletteTypeMeta,
// so adding one EntityDef makes a new entity group render here with no edits to
// this file. The headings, icons, tints and order are byte-for-byte the same as
// the old hand-written TYPE_META/TYPE_ORDER.
const { order: TYPE_ORDER, meta: TYPE_META } = buildPaletteTypeMeta();

// Magnetic hover — the element leans a few px toward the cursor and springs back
// on leave. No-op on touch (no cursor). The CSS `transition-transform` does the
// springback. (GSAP targets the group/stagger wrappers, not these elements, so
// there's no transform conflict.)
function useMagnetic<T extends HTMLElement>(strength = 0.25) {
  const ref = useRef<T | null>(null);
  const frame = useRef(0);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * strength;
    const dy = (e.clientY - (r.top + r.height / 2)) * strength;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { if (ref.current) ref.current.style.transform = `translate(${dx}px, ${dy}px)`; });
  }, [strength]);
  const onPointerLeave = useCallback(() => { if (ref.current) ref.current.style.transform = ""; }, []);
  return { ref, onPointerMove, onPointerLeave };
}

function MagneticItem({ className, children, ...props }: ComponentPropsWithoutRef<typeof Command.Item>) {
  const m = useMagnetic<HTMLDivElement>(0.08);
  return (
    <Command.Item
      ref={m.ref}
      onPointerMove={m.onPointerMove}
      onPointerLeave={m.onPointerLeave}
      className={cn("transition-transform duration-150 ease-out", className)}
      {...props}
    >
      {children}
    </Command.Item>
  );
}

function MagneticChip({ onClick, className, children }: { onClick?: () => void; className?: string; children: React.ReactNode }) {
  const m = useMagnetic<HTMLButtonElement>(0.12);
  return (
    <button
      type="button"
      ref={m.ref}
      onClick={onClick}
      onPointerMove={m.onPointerMove}
      onPointerLeave={m.onPointerLeave}
      className={cn("transition-transform duration-150 ease-out", className)}
    >
      {children}
    </button>
  );
}

export function CommandPaletteProvider({
  children,
  operatorName,
  voiceLanguage,
}: {
  children: React.ReactNode;
  operatorName?: string;
  voiceLanguage?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "chat">("search");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  // Search mode: when ON, the deep index also returns archived/closed/expired
  // records (each flagged lifecycle:"history"). Default OFF keeps everyday
  // search to live records only.
  const [includeHistory, setIncludeHistory] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
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
  const panelRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLSpanElement>(null);

  // GSAP open choreography — a sheen sweep + a staggered content reveal. Lazy
  // imports gsap so it costs nothing until the surface is first opened. Skipped
  // under reduce-motion.
  useEffect(() => {
    if (!isOpen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let killed = false;
    const id = window.setTimeout(async () => {
      const { gsap } = await import("gsap");
      if (killed || !panelRef.current) return;
      const groups = panelRef.current.querySelectorAll<HTMLElement>("[cmdk-group], [data-stagger]");
      if (groups.length) {
        gsap.fromTo(groups, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.04, ease: "power3.out", overwrite: true });
      }
      if (sheenRef.current) {
        gsap.fromTo(sheenRef.current, { xPercent: 0, opacity: 0 }, { keyframes: [{ opacity: 1, duration: 0.15 }, { xPercent: 520, opacity: 0, duration: 0.85, ease: "power2.inOut" }] });
      }
    }, 20);
    return () => { killed = true; window.clearTimeout(id); };
  }, [isOpen, mode]);

  // ⌘K / Ctrl+K (and Ctrl+Space) hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!onPortal) setIsOpen((o) => !o);
      }
      // Ctrl+Space also toggles. Not Cmd+Space — that's Spotlight / the IME
      // switcher on macOS, so we deliberately only honour the Ctrl modifier.
      if (e.ctrlKey && (e.code === "Space" || e.key === " ")) {
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

  // ⌘1–9 / Ctrl+1–9 — jump straight to the Nth visible result in search mode.
  useEffect(() => {
    if (!isOpen || mode !== "search") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key < "1" || e.key > "9") return;
      const items = Array.from(document.querySelectorAll<HTMLElement>("[cmdk-item]"));
      const target = items[Number(e.key) - 1];
      if (target) { e.preventDefault(); target.click(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, mode]);

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
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}${includeHistory ? "&history=1" : ""}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setItems(data.items || []);
          setResults(data.results || []);
        }
      } catch {}
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, isOpen, mode, includeHistory]);

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

  // Recent searches — last few queries/asks, persisted locally.
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem("cos:recent-searches");
      setRecentSearches(raw ? (JSON.parse(raw) as string[]).slice(0, 6) : []);
    } catch { setRecentSearches([]); }
  }, [isOpen]);
  function recordSearch(text: string) {
    const t = text.trim();
    if (t.length < 2) return;
    try {
      const prev = recentSearches.filter((s) => s.toLowerCase() !== t.toLowerCase());
      const next = [t, ...prev].slice(0, 6);
      setRecentSearches(next);
      localStorage.setItem("cos:recent-searches", JSON.stringify(next));
    } catch {}
  }

  // ---- Conversation engine (reuses /api/ask + /api/action) --------------

  function append(msg: Msg) {
    setThread((t) => [...t, msg]);
  }
  function updateMsg(id: string, patch: Partial<Extract<Msg, { role: "assistant" }>>) {
    setThread((t) => t.map((m) => (m.id === id ? ({ ...m, ...patch } as Msg) : m)));
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
    let streamId: string | null = null;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          history: aiHistory(),
          pageContext: { label: pageContext.label, taskCode: pageContext.taskCode, companyId: pageContext.companyId },
          stream: true,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        const fe = friendlyAIError(data.error || `groq-${res.status}`);
        setThinking(false);
        append({ id: newId(), role: "error", text: fe.message, retry: fe.retryable ? text : undefined });
        return;
      }
      const taskCount = Number(res.headers.get("X-Task-Count")) || null;
      const meetingCount = Number(res.headers.get("X-Meeting-Count")) || null;
      const sourceSummary = res.headers.get("X-Source-Summary") || null;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        if (!streamId) { streamId = newId(); setThinking(false); append({ id: streamId, role: "assistant", text: acc, streaming: true }); }
        else updateMsg(streamId, { text: acc });
      }
      if (streamId) updateMsg(streamId, { streaming: false, taskCount, meetingCount, sourceSummary });
      else { setThinking(false); append({ id: newId(), role: "assistant", text: "(no answer)" }); }
      // ORI MEMORY (record), STREAM path. The server can't capture the final
      // answer mid-stream, so the client POSTs the assembled Q&A to the dedicated
      // best-effort endpoint once the stream completes. Fire-and-forget: never
      // block the UI and never surface an error (memory is additive).
      if (streamId && acc.trim()) {
        void fetch("/api/ai-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, answer: acc.trim() }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      setThinking(false);
      // If the stream failed mid-answer, finalise the partial bubble and flag it
      // as cut off — never leave a half-answer that looks complete (or a cursor
      // pulsing forever).
      if (streamId) {
        updateMsg(streamId, { streaming: false });
        append({ id: newId(), role: "error", text: "That answer was cut off before it finished. Tap to try again.", retry: text });
      } else {
        append({ id: newId(), role: "error", text: friendlyAIError("network error").message, retry: text });
      }
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
    recordSearch(t);
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
      {/* Self-managing trace surface — listens for window "cos:trace" events
          dispatched from result rows; always mounted, opens itself. */}
      <TracePanel />
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
              onClick={() => setIsOpen(false)}
            >
              <div className="absolute inset-0 bg-black/40 backdrop-blur-xl" />
              <CommandBackdrop />
            </motion.div>
            <motion.div
              ref={panelRef}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.97, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(4px)" }}
              transition={{ type: "spring", stiffness: 460, damping: 32 }}
              className={cn(
                "relative w-full glass rounded-2xl shadow-lg overflow-hidden flex flex-col",
                mode === "chat" ? "max-w-2xl h-[72vh] max-h-[680px]" : "max-w-xl",
              )}
            >
              {/* GSAP-driven sheen that sweeps once on open. */}
              <span ref={sheenRef} aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 z-10 opacity-0"
                style={{ background: "linear-gradient(105deg, transparent, hsl(var(--accent) / 0.14), transparent)" }} />
              {/* Fluid morph: the panel resizes (layout) while the content crossfades. */}
              <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, filter: "blur(6px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(6px)" }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={cn("flex flex-col min-h-0", mode === "chat" && "flex-1 h-full")}
              >
              {mode === "chat" ? (
                <ConversationPane
                  thread={thread}
                  thinking={thinking}
                  pageLabel={pageContext.label}
                  operatorName={operatorName}
                  voiceLanguage={voiceLanguage}
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
                      placeholder="Search, ask ORI, or type a command…"
                      className="flex-1 w-full min-w-0 !bg-transparent !border-0 !rounded-none !shadow-none text-[15px] leading-6 focus:outline-none focus:!shadow-none focus:!ring-0 placeholder:text-fg-subtle"
                    />
                    <button
                      type="button"
                      onClick={() => setIncludeHistory((h) => !h)}
                      role="switch"
                      aria-checked={includeHistory}
                      title="Also search archived / closed records"
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors",
                        includeHistory ? "border-accent/30 bg-accent-soft text-fg" : "border-border text-fg-muted hover:text-fg",
                      )}
                    >
                      <Clock size={12} className={includeHistory ? "text-accent" : "text-fg-subtle"} />
                      <span className="hidden sm:inline">History</span>
                      <Switch on={includeHistory} size="sm" />
                    </button>
                    <kbd className="shrink-0 text-[10px] font-mono text-fg-subtle border border-border rounded-md px-1.5 py-0.5">
                      ESC
                    </kbd>
                  </div>
                  <Command.List className="max-h-[460px] overflow-y-auto p-1.5">
                    <Command.Empty className="py-8 text-center text-sm text-fg-muted">
                      {trimmed ? "Hit ↵ to ask ORI or run this command." : "No results."}
                    </Command.Empty>

                    {/* AI affordance — Enter routes to conversation. */}
                    {trimmed.length >= 2 && (
                      <Command.Group
                        heading="ORI"
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
                            {routeToAction ? "Run command" : "Ask ORI"}: <span className="text-fg-muted italic">"{trimmed}"</span>
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
                          value="__qa ask ori oracle intelligence assistant"
                          onSelect={() => { setMode("chat"); }}
                          className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                        >
                          <Sparkles size={14} className="text-accent" />
                          <span className="flex-1">Ask ORI</span>
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

                    {/* Recent searches — quick re-run of recent queries/asks. */}
                    {!trimmed && recentSearches.length > 0 && (
                      <Command.Group
                        heading="Recent searches"
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        {recentSearches.map((s) => (
                          <Command.Item
                            key={s}
                            value={`__recent ${s}`}
                            onSelect={() => setQuery(s)}
                            className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                          >
                            <Clock size={14} className="text-fg-subtle" />
                            <span className="flex-1 truncate text-fg-muted">{s}</span>
                          </Command.Item>
                        ))}
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

                    {/* Deep index — people, companies, documents, letters, meetings, vendors, assets */}
                    {results.length > 0 && TYPE_ORDER.map((type) => {
                      const group = results.filter((r) => r.type === type);
                      if (group.length === 0) return null;
                      const meta = TYPE_META[type];
                      const Icon = meta.icon;
                      return (
                        <Command.Group
                          key={type}
                          heading={meta.label}
                          className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                        >
                          {group.map((r) => (
                            <MagneticItem
                              key={`${r.type}-${r.id}`}
                              // Prepend the live query so cmdk's own fuzzy filter
                              // never drops a server-ranked (incl. typo-tolerant) hit.
                              value={`${query} ${r.type} ${r.title} ${r.subtitle}`}
                              onSelect={() => go(r.href)}
                              className={cn(
                                "group/idx px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted",
                                r.lifecycle === "history" && "opacity-70",
                              )}
                            >
                              <Icon size={14} className={cn("shrink-0", meta.tint)} />
                              <span className="flex-1 truncate">{r.title}</span>
                              {r.badge && (
                                <span className="text-[10px] rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted shrink-0 hidden sm:inline">{r.badge}</span>
                              )}
                              <span className="text-xs text-fg-subtle shrink-0 max-w-[150px] truncate hidden md:inline">{r.subtitle}</span>
                              {/* Trace — opens the self-managed TracePanel. Not for
                                  governance (trace doesn't support it). */}
                              {r.type !== "governance" && (
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    window.dispatchEvent(new CustomEvent("cos:trace", { detail: { type: r.type, id: r.id, title: r.title } }));
                                  }}
                                  aria-label="Trace history"
                                  title="Trace history"
                                  className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-subtle hover:text-accent hover:bg-bg-elev transition-colors opacity-0 group-hover/idx:opacity-100 group-data-[selected=true]/idx:opacity-100"
                                >
                                  <GitBranch size={13} />
                                </button>
                              )}
                            </MagneticItem>
                          ))}
                        </Command.Group>
                      );
                    })}

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
                    <span><kbd className="font-mono">⌘1–9</kbd> jump</span>
                    <span className="ml-auto"><Star size={10} className="inline -mt-0.5" /> click to pin</span>
                  </div>
                </Command>
              )}
              </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </CommandCtx.Provider>
  );
}

/* --------------------------------------------------------------------- */
/* Conversation pane — the expanded "Ask ORI" surface.                   */
/* --------------------------------------------------------------------- */

function ConversationPane({
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
          className="inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
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
          className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev/60 px-3 py-1.5 text-[13px] text-fg hover:bg-accent-soft hover:border-accent/30 transition-colors"
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
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev/40 px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg hover:bg-accent-soft hover:border-accent/30 transition-colors"
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
            className="flex-1 rounded px-2 py-1 text-xs focus:outline-none"
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
