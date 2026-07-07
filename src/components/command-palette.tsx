"use client";
import { Command } from "cmdk";
import { useEffect, useState, createContext, useContext, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowRight, Pin, PinOff, Search, Clock, Star, Sparkles, Zap, Loader2, Check, CheckCircle2, AlertOctagon, MessageSquarePlus, FilePlus2, User, Building2, GitBranch, FileText, ChevronRight, Image as ImageIcon, FileSpreadsheet, Presentation, FileType, Activity, Gauge, type LucideIcon } from "lucide-react";
import type { SearchResult } from "@/lib/search";
import type { DirectAnswer } from "@/lib/direct-answer";
import type { SmartAnswer } from "@/lib/smart-answer";
import { buildPaletteTypeMeta } from "./entity-ui";
import { Switch } from "./ui";
import { cn } from "@/lib/cn";
import { NAV_ROUTES, ROUTE_BY_ID } from "@/lib/nav";
import { useNavVisibility, isHiddenNavHref } from "./nav-visibility";
import { usePins } from "@/lib/use-pins";
import { derivePageContext } from "@/lib/page-context";
import { suggestionsFor } from "@/lib/page-suggestions";
import { useCurrentView } from "@/lib/current-view";
import { friendlyAIError } from "@/lib/ai-errors";
import { TracePanel } from "./trace-panel";
import { MagneticItem, HighlightSnippet, HighlightBlock, WhyTag } from "./command-palette-bits";
import { DocReaderPane } from "./command-palette-doc-reader";
import { ConversationPane, type Msg } from "./command-palette-chat";

type Ctx = { open: () => void; close: () => void; ask: (q: string) => void };
const CommandCtx = createContext<Ctx>({ open: () => {}, close: () => {}, ask: () => {} });
export const useCommandPalette = () => useContext(CommandCtx);

/** Backstop tidy of an ORI answer: strip the "Based on the CONTEXT…" opener and
 *  any leaked internal jargon, in case the model ignores the prompt rule. */
function tidyOri(s: string): string {
  let t = s.replace(/^\s*based on (the )?(provided )?(context|data|information)[^,.:]*[,:.]?\s*/i, "");
  t = t.replace(/\bthe context(\.\w+)?\b/gi, "the records").replace(/\bcontext(\.\w+)?\b/gi, "records");
  t = t.replace(/\bmatched (people|companies|person|company)\b/gi, "linked $1");
  if (t.length) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

type SearchItem = { code: string; label: string; sub: string; href: string; status: string; flag: string };
/** One "Today" pulse row from /api/pulse (kept in sync with route.ts PulseItem). */
type PulseItem = { label: string; detail: string; when: string; href?: string };
/** Shape of GET /api/briefing — radar highlights + suggested next actions. Kept
 *  loose (all optional) so a partial/older payload still renders what it can. */
type BriefingData = {
  highlights?: { label: string; detail?: string }[];
  suggestions?: { label: string; detail?: string; href?: string }[];
};

// Pick a file-type icon + tint from a document's original file name, so a PDF,
// photo, spreadsheet or slide deck each read at a glance in the results list.
// Falls back to the generic amber document icon when the extension is unknown.
function fileIconFor(fileName?: string): { Icon: LucideIcon; tint: string } {
  const ext = (fileName ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff"].includes(ext))
    return { Icon: ImageIcon, tint: "text-fuchsia-500" };
  if (["xls", "xlsx", "xlsm", "csv", "tsv"].includes(ext))
    return { Icon: FileSpreadsheet, tint: "text-emerald-500" };
  if (["ppt", "pptx", "key"].includes(ext))
    return { Icon: Presentation, tint: "text-orange-500" };
  if (["doc", "docx", "rtf", "odt", "txt", "md"].includes(ext))
    return { Icon: FileType, tint: "text-sky-500" };
  // pdf + everything else → the standard document icon.
  return { Icon: FileText, tint: "text-amber-500" };
}

// The conversation thread turn type + live-pulse shape now live with the chat
// view; re-exported here to keep the public API stable for any external import.
export type { Pulse } from "./command-palette-chat";

let msgSeq = 0;
const newId = () => `m${++msgSeq}`;

// --- C2: client freshness cache -------------------------------------------
// Reopening the palette re-fetched /api/pulse + /api/briefing every time and
// repeated identical /api/search calls. These small module-level TTL caches let
// a reopen reuse the last result instantly and refresh quietly in the
// background; nothing is ever shown past its TTL. Additive + safe — the render
// path is unchanged, we just seed it from cache and revalidate.
const PULSE_TTL = 150_000; // 2.5 min
const BRIEF_TTL = 150_000; // 2.5 min
const SEARCH_TTL = 20_000; // 20s — brief memo of identical queries
type TtlEntry<T> = { at: number; data: T };
type SearchPayload = { items: SearchItem[]; results: SearchResult[]; directAnswer: DirectAnswer | null; smartAnswer: SmartAnswer | null };
const pulseCache = { current: null as TtlEntry<PulseItem[]> | null };
const briefingCache = { current: null as TtlEntry<BriefingData> | null };
const searchCache = new Map<string, TtlEntry<SearchPayload>>();
const isFresh = (e: { at: number } | null | undefined, ttl: number) => !!e && Date.now() - e.at < ttl;

// Conversational lead-ins ("can you…", "please…", "I want to…") are stripped so
// natural requests reach the acting agent — "can you reopen DAR-012" is treated
// as "reopen DAR-012". Applied before command/agent detection below.
const LEAD_IN =
  /^(?:hey ori|hey|hi|yo|ok|okay|so|actually|right|please|kindly|now|just|also|quickly|quick|and then|and|then|could you please|can you please|please can you|could you|can you|would you mind|would you|will you|may you|can we|could we|we need to|we should|need to|gotta|i'?d like (?:you )?to|i would like (?:you )?to|i want (?:you )?to|i need (?:you )?to|i wanna|let'?s|lets|let me|go ahead and|go ahead|help me(?: to)?|do me a favou?r(?: and)?|ori|pls)\b[\s,]*/i;
function stripLeadIns(text: string): string {
  let s = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = s.replace(LEAD_IN, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

// Which natural-language inputs are commands (mutations / navigations) vs
// free-text questions. Commands go to /api/action, questions to /api/ask.
function looksLikeCommand(text: string): boolean {
  return /^(mark|complete|finish|close|escalate|create|add|update|set|change|edit|rename|reword|retitle|recategor|assign|reassign|give|move|delete|remove|archive|schedule|book|put|announce|post|open|go to|navigate|show me task|remind|chase|nudge|ping|message|tell|notify|let|send|follow[\s-]?up|reach out|draft|prepare|generate|build)\b/i.test(
    stripLeadIns(text),
  );
}
// The ORI AGENT handles the full mutation family — anything that edits, changes
// status (incl. REOPEN), assigns, approves, publishes, files, links or deletes —
// through its clarify→confirm→execute loop and the 22 tools. Navigation (open/go
// to/show/navigate) and pure outreach (remind/send/message/notify) stay on the
// single-shot /api/action path; questions ("update me…", "show me…") stay on Ask.
// Verb-anchored (after stripping lead-ins) so natural phrasing reaches the agent;
// the planner validates against the real tool registry, so it can't invent an action.
function looksLikeAgentCommand(text: string): boolean {
  const t = stripLeadIns(text);
  // "update me / show me / tell me / give me a summary" read as verbs but are
  // QUESTIONS — keep them on the read-only Ask brain.
  if (/^(update|give|show|tell|brief|catch|bring|walk)\s+(me|us)\b/i.test(t)) return false;
  // TIMED reminders ("remind Shivam at 11:45pm…", "nudge her in 30 minutes",
  // "chase him 1 hour before the deadline", "…push notification") need the
  // AGENT's create_smart_reminder — a standing auto-firing rule — not the
  // one-shot /api/action outbox-draft path. A bare "remind X" with no time
  // stays on the old path (no regression).
  if (/^(remind|nudge|chase|ping)\b/i.test(t)) {
    const hasTime =
      /\bat\s+\d{1,2}([:.]\d{2})?\s*(am|pm)?\b/i.test(t) ||
      /\bin\s+\d+(\.\d+)?\s*(minutes?|mins?|hours?|hrs?)\b/i.test(t) ||
      /\b(tonight|this evening|tomorrow at|today at)\b/i.test(t) ||
      /\b(\d+(\.\d+)?\s*(hours?|hrs?|minutes?|mins?)|an?\s+hour)\s+before\s+(the\s+)?(deadline|due)\b/i.test(t) ||
      /\bbefore\s+(the\s+)?(deadline|due)\b/i.test(t);
    if (hasTime || /\bpush\b/i.test(t)) return true;
  }
  return /^(create|add|new|make|edit|rename|reword|retitle|recategor(?:ise|ize)?|categoris(?:e)?|categoriz(?:e)?|prioritis(?:e)?|prioritiz(?:e)?|deprioritis(?:e)?|deprioritiz(?:e)?|update|set|change|move|shift|swap|bump|reassign|assign|unassign|delegate|give|schedule|book|reschedule|postpone|defer|snooze|cancel|call off|announce|post|publish|release|issue|broadcast|draft|reopen|re-?open|close|close off|complete|finish|wrap up|kick off|mark|flag|unflag|tag|escalate|block|unblock|pin|unpin|approve|authoris(?:e)?|authoriz(?:e)?|sign off|reject|decline|delete|remove|archive|trash|bin|purge|clear|wipe|restore|undo|revert|duplicate|copy|clone|split|merge|convert|file|link|attach|upload|record|log|note down|jot|capture|enter|input|fill|verify|handover|hand over|bring forward)\b/i.test(t);
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
  const [mode, setMode] = useState<"search" | "chat" | "doc">("search");
  // The document being read in-place (expand, don't open). Set when a document
  // search result is chosen; cleared on Back.
  const [docReader, setDocReader] = useState<{ id: number; title: string; href: string; query: string } | null>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [directAnswer, setDirectAnswer] = useState<DirectAnswer | null>(null);
  const [smartAnswer, setSmartAnswer] = useState<SmartAnswer | null>(null);
  // The value of the currently-highlighted cmdk item (arrow-key focus), so the
  // desktop preview pane can show that result live. Result items carry a
  // "__r_<type>_<id>" token in their value we parse back to the SearchResult.
  const [activeValue, setActiveValue] = useState("");
  // Search mode: when ON, the deep index also returns archived/closed/expired
  // records (each flagged lifecycle:"history"). Default OFF keeps everyday
  // search to live records only.
  const [includeHistory, setIncludeHistory] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  // "Today" pulse — the estate's most recent notable events, shown in the empty
  // search state only. Plain fetch (no server import); fetched once per open.
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  // "AI today" — a calm informational stat of today's AI usage from /api/ai-usage.
  // Plain fetch (no server import); renders nothing on error/empty.
  type AiUsage = { today: { calls: number; tokens: number }; cap?: number; pct?: number };
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const aiUsageFetched = useRef(false);
  // "Your briefing" — radar highlights + suggested actions from /api/briefing,
  // fetched once on select (not eagerly) and shown inline in the empty state.
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [thread, setThread] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const { pins, toggle } = usePins();
  const navVisibility = useNavVisibility();
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

  // Live "glance" for the previewed entity — a small set of KPI stats fetched
  // from /api/entity-glance (company/person/task/document only). Cached per
  // type+id so quick hovering never re-fetches; stale requests are aborted.
  type Glance = { label: string; value: string | number }[];
  const [glance, setGlance] = useState<{ key: string; stats: Glance } | null>(null);
  const [glanceLoading, setGlanceLoading] = useState(false);
  const glanceCache = useRef<Map<string, Glance>>(new Map());

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

  // "Today" pulse — on each admin-surface open, seed from the freshness cache
  // instantly, then revalidate quietly in the background only when the cache is
  // stale (TTL). Reopening within the TTL costs no fetch and shows no stale data.
  useEffect(() => {
    if (!isOpen || onPortal) return;
    if (pulseCache.current) setPulse(pulseCache.current.data);
    if (isFresh(pulseCache.current, PULSE_TTL)) return;
    let cancelled = false;
    fetch("/api/pulse", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.pulse)) {
          pulseCache.current = { at: Date.now(), data: d.pulse as PulseItem[] };
          if (!cancelled) setPulse(d.pulse as PulseItem[]);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, onPortal]);

  // "AI today" — fetch today's AI usage once, first time the palette opens on an
  // admin surface. Plain fetch; failures render nothing.
  useEffect(() => {
    if (!isOpen || onPortal || aiUsageFetched.current) return;
    aiUsageFetched.current = true;
    let cancelled = false;
    fetch("/api/ai-usage", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && d.today) setAiUsage(d as AiUsage); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, onPortal]);

  // "Your briefing" — fetch radar highlights + suggestions once, on first select.
  // Plain fetch (no server import); renders nothing on error/empty.
  const loadBriefing = useCallback(async () => {
    setBriefingOpen(true);
    // Seed from the freshness cache instantly; only fetch when it's stale (TTL).
    if (briefingCache.current) setBriefing(briefingCache.current.data);
    if (isFresh(briefingCache.current, BRIEF_TTL)) return;
    setBriefingLoading(true);
    try {
      const r = await fetch("/api/briefing", { cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      if (d && typeof d === "object") {
        briefingCache.current = { at: Date.now(), data: d as BriefingData };
        setBriefing(d as BriefingData);
      }
    } catch {
      // Silent — the entry simply shows nothing to act on.
    } finally {
      setBriefingLoading(false);
    }
  }, []);

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
      // ESC closes from search mode; from the doc reader it steps back to results.
      if (e.key === "Escape") {
        if (mode === "doc") { setMode("search"); setDocReader(null); return; }
        setIsOpen((o) => (o && mode === "search" ? false : o));
      }
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
    // Brief memo of identical (query + history) lookups: a reopen or a
    // back-and-forth edit that lands on the same query reuses the last result
    // instantly and skips the fetch while it's fresh (TTL). Applying it also
    // seeds the render immediately so there's no flash of the previous results.
    const key = `${includeHistory ? "h:" : ""}${query}`;
    const cached = searchCache.get(key);
    if (cached) {
      setItems(cached.data.items);
      setResults(cached.data.results);
      setDirectAnswer(cached.data.directAnswer);
      setSmartAnswer(cached.data.smartAnswer);
      if (isFresh(cached, SEARCH_TTL)) return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}${includeHistory ? "&history=1" : ""}`);
        if (!res.ok) return;
        const data = await res.json();
        const payload: SearchPayload = {
          items: data.items || [],
          results: data.results || [],
          directAnswer: data.directAnswer ?? null,
          smartAnswer: data.smartAnswer ?? null,
        };
        searchCache.set(key, { at: Date.now(), data: payload });
        // Bound the memo so it can't grow unbounded over a long session.
        if (searchCache.size > 40) searchCache.delete(searchCache.keys().next().value as string);
        if (!cancelled) {
          setItems(payload.items);
          setResults(payload.results);
          setDirectAnswer(payload.directAnswer);
          setSmartAnswer(payload.smartAnswer);
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
  const routeToAction =
    looksLikeAgentCommand(trimmed) || looksLikeCommand(trimmed) || isDeterministicQuery(trimmed);

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

  // Ask uses the always-on /api/ask engine (Groq smart model + rich context —
  // tasks, compliance, governance, documents), so quick AND detailed questions
  // answer in seconds without depending on the owner's PC. The Max-plan cloud
  // worker stays for heavy/background jobs (document extraction) via the queue.
  // Carries recent history so follow-ups ("list all of them") resolve; the route
  // records the exchange to ORI memory server-side.
  async function runAsk(text: string) {
    setThinking(true);
    try {
      // Stream the answer so words appear as they're written (first tokens in
      // well under a second) — the data is already indexed, so this is the whole
      // perceived latency. Falls back to a clear error if the stream never opens.
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
        setThinking(false);
        const body = await res.json().catch(() => ({}));
        append({ id: newId(), role: "error", text: friendlyAIError(body?.error ?? `error-${res.status}`).message, retry: text });
        return;
      }
      // Open a live assistant bubble and append deltas as they arrive.
      const id = newId();
      append({ id, role: "assistant", text: "" });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setThinking(false);
          updateMsg(id, { text: tidyOri(acc) });
        }
      } catch {
        // Mid-stream failure — keep whatever streamed, mark it truncated.
        if (!acc.trim()) { updateMsg(id, { text: friendlyAIError("network error").message } as never); }
      }
      setThinking(false);
      if (!acc.trim()) updateMsg(id, { text: "(no answer)" });
      else {
        // Record the completed exchange to ORI memory (stream path doesn't do it
        // server-side). Fire-and-forget.
        void fetch("/api/ai-memory", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, answer: acc.trim() }), keepalive: true,
        }).catch(() => {});
      }
    } catch {
      setThinking(false);
      append({ id: newId(), role: "error", text: friendlyAIError("network error").message, retry: text });
    }
  }

  // Commands surface as their own self-managed ActionCard (confirm → run).
  function runCommand(text: string) {
    append({ id: newId(), role: "action", command: text });
  }

  // Agent commands open a self-managed AgentCard — a clarify→confirm→execute
  // conversation (multi-turn, multi-step) with /api/ori.
  function runAgent(text: string) {
    append({ id: newId(), role: "agent", command: text });
  }

  // Entry point for every conversational turn.
  function submitPrompt(text: string) {
    const t = text.trim();
    if (!t) return;
    recordSearch(t);
    setMode("chat");
    setQuery("");
    append({ id: newId(), role: "user", text: t });
    if (looksLikeAgentCommand(t)) runAgent(t);
    else if (looksLikeCommand(t) || isDeterministicQuery(t)) runCommand(t);
    else runAsk(t);
  }

  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href);
    },
    [router],
  );

  // No-dead-end fallback. When an agent turn resolves to nothing actionable (an
  // "I'm not sure how to action that" answer), the AgentCard offers a one-tap
  // "Ask ORI instead" that fires this event — we re-run the SAME text through
  // the read-only Ask path so the user always gets an answer, never a dead end.
  useEffect(() => {
    const onAskInstead = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text?.trim();
      if (!text) return;
      append({ id: newId(), role: "user", text });
      void runAsk(text);
    };
    window.addEventListener("cos:ori-ask-instead", onAskInstead as EventListener);
    return () => window.removeEventListener("cos:ori-ask-instead", onAskInstead as EventListener);
    // append/runAsk are stable within this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build route groups. Hidden routes (e.g. Tax & Legal when paused) drop out of
  // every group so the page can't be jumped to.
  const visible = (r: { href: string } | undefined): r is { href: string } =>
    !!r && !isHiddenNavHref(r.href, navVisibility);
  const pinnedRoutes = pins.map((id) => ROUTE_BY_ID[id]).filter(visible);
  const recentRoutes = recents
    .filter((id) => !pins.includes(id))
    .map((id) => ROUTE_BY_ID[id])
    .filter(visible)
    .slice(0, 5);
  const otherRoutes = NAV_ROUTES.filter(
    (r) => visible(r) && !pins.includes(r.id) && !recentRoutes.some((rr) => rr.id === r.id),
  );

  // The highlighted result → the desktop preview pane. Parse the "__r_<type>_<id>"
  // token from the active cmdk value; fall back to the hero / top result so the
  // pane is never empty (cmdk doesn't fire onValueChange for the initial select).
  const activeResult = ((): SearchResult | null => {
    const m = /__r_([a-z]+)_(\d+)/.exec(activeValue);
    const parsed = m ? results.find((r) => r.type === m[1] && r.id === Number(m[2])) : null;
    return parsed ?? null;
  })();
  // Entity hero — a strongly-matched company/person surfaces as a card on top,
  // "the thing you meant, front and centre". Excluded from its own group below.
  const heroResult = results.find((r) => (r.type === "company" || r.type === "person") && r.score >= 60) ?? null;

  // Scoped quick-links for a company/person result (navigate, no fetch).
  const scopedLinks = (r: SearchResult): Array<{ label: string; icon: LucideIcon; href: string }> => {
    if (r.type === "company") return [
      { label: "Open company", icon: Building2, href: r.href },
      { label: "Its documents", icon: FileText, href: `/documents?company=${r.id}` },
    ];
    if (r.type === "person") return [
      { label: "Open profile", icon: User, href: r.href },
      { label: "Their documents", icon: FileText, href: `/documents?person=${r.id}` },
    ];
    return [];
  };

  // The desktop preview pane — shows the highlighted result live so you can skim
  // without opening. No extra fetch: identity + why + snippet + quick actions.
  const openResult = (r: SearchResult) => {
    if (r.type === "document") { setDocReader({ id: r.id, title: r.title, href: r.href, query }); setMode("doc"); }
    else go(r.href);
  };
  // The entity the preview pane is currently showing (same seed as previewNode).
  const previewEntity = activeResult ?? heroResult ?? results[0] ?? null;
  // Types the glance endpoint answers for; anything else renders no KPI strip.
  const glanceKey = previewEntity && ["company", "person", "task", "document"].includes(previewEntity.type)
    ? `${previewEntity.type}:${previewEntity.id}` : null;

  // Fetch the live glance for the previewed entity. Cached per type+id; stale
  // requests aborted so fast hovering can't spam or land out of order.
  useEffect(() => {
    if (!glanceKey) { setGlance(null); setGlanceLoading(false); return; }
    const cached = glanceCache.current.get(glanceKey);
    if (cached) { setGlance({ key: glanceKey, stats: cached }); setGlanceLoading(false); return; }
    const [type, id] = glanceKey.split(":");
    const ctrl = new AbortController();
    setGlanceLoading(true);
    fetch(`/api/entity-glance?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stats?: Glance } | null) => {
        const stats = Array.isArray(data?.stats) ? data!.stats : [];
        glanceCache.current.set(glanceKey, stats);
        setGlance({ key: glanceKey, stats });
      })
      .catch(() => { /* aborted or failed → render nothing extra */ })
      .finally(() => setGlanceLoading(false));
    return () => ctrl.abort();
  }, [glanceKey]);

  const previewNode = (() => {
    // Seed with the hero / top result so the pane always shows something; hover
    // and arrow-keys refine it.
    const r = previewEntity;
    if (!r) return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center text-fg-subtle">
        <Sparkles size={18} className="opacity-50" />
        <p className="text-[11px] leading-relaxed">Use <kbd className="font-mono">↑↓</kbd> to preview a result here, <kbd className="font-mono">↵</kbd> to open it.</p>
      </div>
    );
    // Fallback for any type not in the palette meta map (e.g. a task surfaced by
    // semantic search, which renders elsewhere) so previewing it can never throw.
    const meta = TYPE_META[r.type] ?? { icon: Sparkles, tint: "text-fg-subtle", label: r.type };
    const pIcon = r.type === "document" ? fileIconFor(r.fileName) : { Icon: meta.icon, tint: meta.tint };
    const PIcon = pIcon.Icon;
    const links = scopedLinks(r);
    return (
      <div className="flex flex-col gap-3 p-3.5">
        <div className="flex items-start gap-2.5">
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-muted", pIcon.tint)}><PIcon size={17} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{meta.label}</span>
              <WhyTag kind={r.matchKind} />
            </div>
            <div className="mt-0.5 text-sm font-semibold leading-snug break-words">{r.title}</div>
          </div>
        </div>
        {r.badge && <div className="font-mono text-[11px] text-fg-muted">{r.badge}</div>}
        {/* Live glance — §13 KPI pills (bold tabular number + muted label). */}
        {glanceKey === `${r.type}:${r.id}` && glanceLoading && !glance && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex flex-col gap-1">
                <span className="h-3.5 w-8 animate-pulse rounded bg-bg-muted" />
                <span className="h-2.5 w-12 animate-pulse rounded bg-bg-muted/70" />
              </span>
            ))}
          </div>
        )}
        {glance && glance.key === `${r.type}:${r.id}` && glance.stats.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {glance.stats.map((s, i) => (
              <span key={i} className="flex flex-col leading-tight">
                <b className="tabular text-sm font-semibold text-fg">{s.value}</b>
                <span className="text-[10.5px] text-fg-subtle">{s.label}</span>
              </span>
            ))}
          </div>
        )}
        {r.snippet ? <div className="rounded-lg bg-bg-subtle/50 p-2 ring-1 ring-border/50"><HighlightBlock text={r.snippet} /></div>
          : <div className="text-xs leading-relaxed text-fg-muted">{r.subtitle}</div>}
        <div className="mt-1 flex flex-col gap-1.5">
          <button type="button" onClick={() => openResult(r)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90">
            {r.type === "document" ? <><FileText size={13} /> Read in place</> : <><ArrowRight size={13} /> Open</>}
          </button>
          {links.map((l) => (
            <button key={l.href} type="button" onClick={() => go(l.href)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-fg-muted ring-1 ring-border transition-colors hover:text-fg hover:bg-bg-muted/50">
              <l.icon size={13} /> {l.label} →
            </button>
          ))}
          {r.type !== "governance" && (
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("cos:trace", { detail: { type: r.type, id: r.id, title: r.title } }))}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-fg-subtle transition-colors hover:text-accent">
              <GitBranch size={13} /> Trace history
            </button>
          )}
        </div>
      </div>
    );
  })();

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
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              ref={panelRef}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.99 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "relative w-full glass rounded-2xl shadow-lg overflow-hidden flex flex-col",
                mode === "chat" || mode === "doc" ? "max-w-2xl h-[72vh] max-h-[680px]" : "max-w-xl lg:max-w-[52rem]",
              )}
            >
              {/* GSAP-driven sheen that sweeps once on open. */}
              <span ref={sheenRef} aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 z-10 opacity-0"
                style={{ background: "linear-gradient(105deg, transparent, hsl(var(--accent) / 0.14), transparent)" }} />
              {/* Fluid morph: the panel resizes (layout) while the content crossfades. */}
              <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={cn("flex flex-col min-h-0", (mode === "chat" || mode === "doc") && "flex-1 h-full")}
              >
              {mode === "doc" && docReader ? (
                <DocReaderPane
                  doc={docReader}
                  onBack={() => { setMode("search"); setDocReader(null); }}
                  onClose={() => setIsOpen(false)}
                  onOpen={(href) => { setIsOpen(false); router.push(href); }}
                />
              ) : mode === "chat" ? (
                <ConversationPane
                  thread={thread}
                  thinking={thinking}
                  pageLabel={pageContext.label}
                  operatorName={operatorName}
                  voiceLanguage={voiceLanguage}
                  suggestions={suggestionsFor(pageContext)}
                  onSubmit={submitPrompt}
                  onRetry={(t) => { append({ id: newId(), role: "user", text: t }); if (looksLikeAgentCommand(t)) runAgent(t); else if (looksLikeCommand(t) || isDeterministicQuery(t)) runCommand(t); else runAsk(t); }}
                  onBack={() => { setMode("search"); setThread([]); }}
                  onClose={() => setIsOpen(false)}
                  onNavigate={(href) => { setIsOpen(false); router.push(href); }}
                  currentView={currentView}
                />
              ) : (
                <Command shouldFilter={true} loop onValueChange={setActiveValue}>
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
                        "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors",
                        includeHistory ? "bg-accent text-accent-fg ring-accent" : "ring-border/60 text-fg-muted hover:text-fg",
                      )}
                    >
                      <Clock size={12} className={includeHistory ? "text-accent-fg" : "text-fg-subtle"} />
                      <span className="hidden sm:inline">History</span>
                      <Switch on={includeHistory} size="sm" />
                    </button>
                    <kbd className="shrink-0 text-[10px] font-mono text-fg-subtle border border-border rounded-md px-1.5 py-0.5">
                      ESC
                    </kbd>
                  </div>
                  <div className="flex min-h-0">
                  <Command.List className="flex-1 min-w-0 max-h-[460px] overflow-y-auto p-1.5 scroll-fade-y slim-scroll">
                    <Command.Empty className="py-8 text-center text-sm text-fg-muted">
                      {trimmed ? "Hit ↵ to ask ORI or run this command." : "No results."}
                    </Command.Empty>

                    {/* Entity hero — the strongly-matched company/person you meant,
                        front and centre with quick-links to its records. */}
                    {heroResult && (
                      <Command.Group className="[&_[cmdk-group-heading]]:hidden">
                        <MagneticItem
                          value={`${query} __r_${heroResult.type}_${heroResult.id} ${heroResult.title} ${heroResult.subtitle}`}
                          onMouseEnter={() => setActiveValue(`__r_${heroResult.type}_${heroResult.id}`)}
                          onSelect={() => go(heroResult.href)}
                          className="group/hero mb-1 flex items-center gap-3 rounded-xl border border-[#2dd4bf]/25 bg-[#2dd4bf]/[0.06] px-3 py-2.5 cursor-pointer aria-selected:border-[#2dd4bf]/50"
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#2dd4bf,#16a34a)" }}>
                            {heroResult.type === "company" ? <Building2 size={19} /> : <User size={19} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold">{heroResult.title}</span>
                              <span className="rounded bg-[#2dd4bf]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#2dd4bf]">{heroResult.type}</span>
                              <WhyTag kind={heroResult.matchKind} />
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-fg-subtle">{heroResult.subtitle}</span>
                            {/* Live glance pills for the hero (cache-backed by the preview fetch). */}
                            {(() => {
                              const hk = `${heroResult.type}:${heroResult.id}`;
                              const stats = glance?.key === hk ? glance.stats : glanceCache.current.get(hk);
                              if (!stats || stats.length === 0) return null;
                              return (
                                <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                                  {stats.slice(0, 4).map((s, i) => (
                                    <span key={i} className="flex items-baseline gap-1 leading-none">
                                      <b className="tabular text-[13px] font-semibold text-fg">{s.value}</b>
                                      <span className="text-[10px] text-fg-subtle">{s.label}</span>
                                    </span>
                                  ))}
                                </span>
                              );
                            })()}
                          </span>
                          <span className="hidden shrink-0 items-center gap-1.5 sm:flex" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                            {scopedLinks(heroResult).slice(1).map((l) => (
                              <button key={l.href} type="button" onClick={() => go(l.href)}
                                className="inline-flex items-center gap-1 rounded-lg bg-bg-elev px-2 py-1 text-[11px] font-medium text-fg-muted ring-1 ring-border transition-colors hover:text-fg">
                                <l.icon size={12} /> {l.label.replace(/^(Its|Their) /, "")}
                              </button>
                            ))}
                            <ChevronRight size={15} className="text-[#2dd4bf]" />
                          </span>
                        </MagneticItem>
                      </Command.Group>
                    )}

                    {/* Smart answer — instant natural-language LIST answer, no AI
                        ("who's on leave", "expiring documents", "MES overdue tasks",
                        "how many staff"). Rendered as a card straight from the index. */}
                    {smartAnswer && trimmed.length >= 2 && (
                      <Command.Group
                        heading="Answer"
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        <div className="mx-1 mb-1 rounded-xl bg-accent/[0.06] ring-1 ring-accent/15 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                            <span className="text-sm font-semibold text-fg">{smartAnswer.title}</span>
                            {smartAnswer.count > 0 && (
                              <span className="text-[11px] font-semibold tabular rounded-lg bg-accent/15 text-accent px-2 py-0.5">{smartAnswer.count}</span>
                            )}
                          </div>
                          {smartAnswer.note && <div className="px-3 pb-2 text-xs text-fg-muted">{smartAnswer.note}</div>}
                          {smartAnswer.rows.length > 0 && (
                            <div className="divide-y divide-border/40">
                              {smartAnswer.rows.map((row, i) => (
                                <Command.Item
                                  key={`__smart_${i}`}
                                  value={`__smart__ ${smartAnswer.title} ${row.label} ${i}`}
                                  onSelect={() => go(row.href)}
                                  className="px-3 py-2 flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-accent/10"
                                >
                                  <span className="flex-1 min-w-0">
                                    <span className="block truncate text-fg">{row.label}</span>
                                    {row.sub && <span className="block truncate text-[11px] text-fg-subtle">{row.sub}</span>}
                                  </span>
                                  {row.badge && (
                                    <span className={cn(
                                      "shrink-0 text-[10px] font-medium rounded-lg px-1.5 py-0.5",
                                      row.tone === "danger" ? "bg-danger/10 text-danger"
                                        : row.tone === "warn" ? "bg-warn/10 text-warn"
                                        : row.tone === "success" ? "bg-success/10 text-success"
                                        : "bg-bg-muted text-fg-muted",
                                    )}>{row.badge}</span>
                                  )}
                                  <ArrowRight size={13} className="text-fg-subtle shrink-0" />
                                </Command.Item>
                              ))}
                            </div>
                          )}
                          {smartAnswer.href && smartAnswer.count > smartAnswer.rows.length && (
                            <Command.Item
                              value={`__smart_all__ ${smartAnswer.title}`}
                              onSelect={() => go(smartAnswer.href!)}
                              className="px-3 py-2 text-[11px] font-medium text-accent cursor-pointer aria-selected:bg-accent/10 border-t border-border/40"
                            >
                              See all {smartAnswer.count} →
                            </Command.Item>
                          )}
                        </div>
                      </Command.Group>
                    )}

                    {/* Direct answer — instant "it just knows" value for an
                        entity+attribute lookup (e.g. "Gangadhar passport"). */}
                    {directAnswer && trimmed.length >= 2 && (
                      <Command.Group
                        heading="Answer"
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        <Command.Item
                          value={`__answer__ ${directAnswer.entity} ${directAnswer.label}`}
                          onSelect={() => go(directAnswer.href)}
                          className="px-2 py-2 rounded-lg flex items-center gap-3 text-sm cursor-pointer aria-selected:bg-accent/10"
                        >
                          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent shrink-0">
                            <Sparkles size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-wider text-fg-subtle truncate">
                              {directAnswer.label} · {directAnswer.entity}
                            </div>
                            <div className={`font-semibold truncate ${directAnswer.value ? "text-fg" : "text-fg-subtle italic"}`}>
                              {directAnswer.value ?? "Not on record"}
                            </div>
                          </div>
                          <ArrowRight size={14} className="text-fg-subtle shrink-0" />
                        </Command.Item>
                      </Command.Group>
                    )}

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

                    {/* Today — the estate's live pulse (empty query only). §13
                        icon-badge rows: outline icon, quiet sublabel + "when". */}
                    {!trimmed && pulse.length > 0 && (
                      <Command.Group
                        heading="Today"
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        <div className="max-h-64 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,#000_10px,#000_calc(100%-10px),transparent)]">
                          {pulse.map((p, i) => (
                            <Command.Item
                              key={`__pulse_${i}`}
                              value={`__pulse ${i} ${p.label} ${p.detail}`}
                              onSelect={() => { if (p.href) go(p.href); }}
                              className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                            >
                              <span className="grid place-items-center w-7 h-7 rounded-lg border border-border text-fg-subtle shrink-0">
                                <Activity size={13} />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block truncate text-fg">{p.label}</span>
                                {p.detail && <span className="block truncate text-[12px] text-fg-subtle">{p.detail}</span>}
                              </span>
                              {p.when && <span className="text-[11px] text-fg-subtle shrink-0 tabular-nums">{p.when}</span>}
                            </Command.Item>
                          ))}
                        </div>
                      </Command.Group>
                    )}

                    {/* AI today — a calm informational stat of today's AI usage.
                        §13: rounded-lg, outline icon, quiet. Not selectable. */}
                    {!trimmed && !onPortal && aiUsage && (aiUsage.today.calls > 0 || aiUsage.cap) && (
                      <div className="px-2 pt-1 pb-2">
                        <button
                          type="button"
                          onClick={() => go("/settings#ai-usage")}
                          className="w-full text-left px-2.5 py-2 rounded-lg border border-border flex items-center gap-2.5 text-sm hover:bg-bg-muted/60 transition-colors"
                        >
                          <span className="grid place-items-center w-7 h-7 rounded-lg border border-border text-fg-subtle shrink-0">
                            <Gauge size={13} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[12px] uppercase tracking-wider text-fg-subtle">AI today</span>
                            <span className="block truncate text-fg tabular-nums">
                              {aiUsage.cap != null && aiUsage.pct != null
                                ? `${aiUsage.pct}% of cap`
                                : `${aiUsage.today.calls} ${aiUsage.today.calls === 1 ? "call" : "calls"}${
                                    aiUsage.today.tokens > 0
                                      ? ` · ${aiUsage.today.tokens >= 1000
                                          ? `${(aiUsage.today.tokens / 1000).toFixed(aiUsage.today.tokens >= 100_000 ? 0 : 1)}k`
                                          : aiUsage.today.tokens} tokens`
                                      : ""
                                  }`}
                            </span>
                          </span>
                          <ArrowRight size={13} className="text-fg-subtle shrink-0" />
                        </button>
                      </div>
                    )}

                    {/* Your briefing — one tap fetches /api/briefing and expands
                        radar highlights + suggestions as §13 icon-badge rows.
                        Renders nothing on error/empty; calm + additive. */}
                    {!trimmed && !onPortal && (
                      <Command.Group
                        heading="Your briefing"
                        className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                      >
                        {!briefingOpen ? (
                          <Command.Item
                            value="__briefing open your briefing radar highlights suggestions"
                            onSelect={loadBriefing}
                            className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                          >
                            <span className="grid place-items-center w-7 h-7 rounded-lg border border-border text-accent shrink-0">
                              <Sparkles size={13} />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block truncate text-fg">Your briefing</span>
                              <span className="block truncate text-[12px] text-fg-subtle">Radar highlights and what to do next</span>
                            </span>
                            <ChevronRight size={14} className="text-fg-subtle shrink-0" />
                          </Command.Item>
                        ) : briefingLoading ? (
                          <div className="px-2 py-2 flex items-center gap-2.5 text-sm text-fg-subtle">
                            <Loader2 size={14} className="animate-spin text-accent" />
                            <span>Reading the estate…</span>
                          </div>
                        ) : (
                          (() => {
                            const highlights = briefing?.highlights ?? [];
                            const sugg = briefing?.suggestions ?? [];
                            if (!highlights.length && !sugg.length) return null;
                            return (
                              <div className="max-h-72 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,#000_10px,#000_calc(100%-10px),transparent)]">
                                {highlights.map((h, i) => (
                                  <div
                                    key={`__brief_h_${i}`}
                                    className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm"
                                  >
                                    <span className="grid place-items-center w-7 h-7 rounded-lg border border-border text-fg-subtle shrink-0">
                                      <Activity size={13} />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                      <span className="block truncate text-fg">{h.label}</span>
                                      {h.detail && <span className="block truncate text-[12px] text-fg-subtle">{h.detail}</span>}
                                    </span>
                                  </div>
                                ))}
                                {sugg.map((s, i) => (
                                  <Command.Item
                                    key={`__brief_s_${i}`}
                                    value={`__briefsugg ${i} ${s.label} ${s.detail ?? ""}`}
                                    onSelect={() => { if (s.href) go(s.href); }}
                                    className={cn(
                                      "px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm aria-selected:bg-bg-muted",
                                      s.href ? "cursor-pointer" : "cursor-default",
                                    )}
                                  >
                                    <span className="grid place-items-center w-7 h-7 rounded-lg border border-border text-accent shrink-0">
                                      <Zap size={13} />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                      <span className="block truncate text-fg">{s.label}</span>
                                      {s.detail && <span className="block truncate text-[12px] text-fg-subtle">{s.detail}</span>}
                                    </span>
                                    {s.href && <ArrowRight size={13} className="text-fg-subtle shrink-0" />}
                                  </Command.Item>
                                ))}
                              </div>
                            );
                          })()
                        )}
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
                      const group = results.filter((r) => r.type === type && !(heroResult && r.id === heroResult.id));
                      if (group.length === 0) return null;
                      const meta = TYPE_META[type];
                      if (!meta) return null; // unknown type → skip rather than crash
                      const Icon = meta.icon;
                      // Documents get a body-aware heading: "Found in N documents · M
                      // mentions" (mentions = results with a matched in-body snippet).
                      const isDoc = type === "document";
                      const mentions = isDoc ? group.filter((r) => r.snippet).length : 0;
                      const heading = isDoc
                        ? `Found in ${group.length} document${group.length === 1 ? "" : "s"}${mentions ? ` · ${mentions} mention${mentions === 1 ? "" : "s"}` : ""}`
                        : meta.label;
                      return (
                        <Command.Group
                          key={type}
                          heading={heading}
                          className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:bg-bg-subtle/60 [&_[cmdk-group-heading]]:rounded-lg [&_[cmdk-group-heading]]:mb-0.5"
                        >
                          {group.map((r) => {
                            // Per-document file-type icon (PDF/photo/Excel/slide);
                            // other types keep their single entity icon.
                            const rowIcon = isDoc ? fileIconFor(r.fileName) : { Icon, tint: meta.tint };
                            const RowIcon = rowIcon.Icon;
                            return (
                            <MagneticItem
                              key={`${r.type}-${r.id}`}
                              // Prepend the live query so cmdk's own fuzzy filter
                              // never drops a server-ranked (incl. typo-tolerant) hit.
                              // The __r_<type>_<id> token lets the preview pane resolve this row.
                              value={`${query} __r_${r.type}_${r.id} ${r.title} ${r.subtitle} ${r.snippet ?? ""}`}
                              onMouseEnter={() => setActiveValue(`__r_${r.type}_${r.id}`)}
                              onFocus={() => setActiveValue(`__r_${r.type}_${r.id}`)}
                              onSelect={() => {
                                if (r.type === "document") {
                                  setDocReader({ id: r.id, title: r.title, href: r.href, query });
                                  setMode("doc");
                                } else {
                                  go(r.href);
                                }
                              }}
                              className={cn(
                                "group/idx px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted",
                                r.lifecycle === "history" && "opacity-70",
                              )}
                            >
                              <RowIcon size={14} className={cn("shrink-0 self-start mt-0.5", rowIcon.tint)} />
                              <span className="flex-1 min-w-0">
                                <span className="block truncate">{r.title}</span>
                                {/* Full-text hit inside the document body — the exact
                                    words, with the match highlighted. */}
                                {r.snippet && <HighlightSnippet text={r.snippet} />}
                              </span>
                              {r.badge && (
                                <span className="text-[10px] rounded-lg bg-bg-muted px-2 py-0.5 text-fg-muted shrink-0 self-start mt-0.5 hidden sm:inline">{r.badge}</span>
                              )}
                              {!r.snippet && (
                                <span className="text-xs text-fg-subtle shrink-0 max-w-[150px] truncate hidden md:inline">{r.subtitle}</span>
                              )}
                              <WhyTag kind={r.matchKind} />
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
                              {/* Documents expand in place into the reader — a chevron
                                  signals the row opens rather than navigates away. */}
                              {isDoc && (
                                <ChevronRight size={14} className="shrink-0 self-start mt-0.5 text-fg-subtle group-data-[selected=true]/idx:text-accent transition-transform group-data-[selected=true]/idx:translate-x-0.5" />
                              )}
                            </MagneticItem>
                            );
                          })}
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
                  {/* Live preview pane — desktop only, when a query has results. */}
                  {trimmed && (results.length > 0 || items.length > 0) && (
                    <div className="hidden lg:flex w-[260px] shrink-0 flex-col border-l border-border/60 bg-bg-subtle/30 max-h-[460px] overflow-y-auto scroll-fade-y slim-scroll">
                      {previewNode}
                    </div>
                  )}
                  </div>
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
        <span className="text-[10px] rounded-lg bg-bg-muted px-2 py-0.5 text-fg-muted shrink-0 hidden sm:inline">{item.status}</span>
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
