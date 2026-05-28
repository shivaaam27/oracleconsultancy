"use client";
import { Command } from "cmdk";
import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowRight, Pin, PinOff, Search, Clock, Star, Sparkles, Bot, Zap, Loader2, Check, X as XIcon, CheckCircle2, AlertOctagon, MessageSquarePlus, FilePlus2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ROUTES, ROUTE_BY_ID } from "@/lib/nav";
import { usePins } from "@/lib/use-pins";

type Ctx = { open: () => void; close: () => void };
const CommandCtx = createContext<Ctx>({ open: () => {}, close: () => {} });
export const useCommandPalette = () => useContext(CommandCtx);

type SearchItem = { code: string; label: string; sub: string; href: string; status: string; flag: string };

type AIMode = null | "asking" | "answer" | "actionPreview" | "actionRunning" | "actionDone" | "actionError";

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState<AIMode>(null);
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [aiTaskCount, setAiTaskCount] = useState<number | null>(null);
  const [actionIntent, setActionIntent] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<string>("");
  const { pins, toggle } = usePins();
  const router = useRouter();

  function resetAI() {
    setAiMode(null);
    setAiAnswer("");
    setAiTaskCount(null);
    setActionIntent(null);
    setActionMessage("");
  }

  // ⌘K / Ctrl+K hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Server search (tasks)
  useEffect(() => {
    if (!isOpen) return;
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
  }, [query, isOpen]);

  // Reset query + AI state on close
  useEffect(() => {
    if (!isOpen) { setQuery(""); resetAI(); }
  }, [isOpen]);

  // Reset AI panel as soon as the user types again
  useEffect(() => { resetAI(); }, [query]);

  // Detect intent type from query
  const trimmed = query.trim();
  const isQuestion = /^(what|who|when|where|why|how|which|whose|do|does|did|is|are|was|were|can|could|should|would|tell me|show me|list|find|any)\b|\?$/i.test(trimmed);
  const isAction = /^(mark|complete|escalate|create|add|update|set|change|open|go to|show me task|navigate)/i.test(trimmed);

  async function runAsk() {
    if (!trimmed) return;
    setAiMode("asking");
    setAiAnswer("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (data.error) { setAiMode("actionError"); setActionMessage(data.error); return; }
      setAiAnswer(data.answer || "(no answer)");
      setAiTaskCount(data.taskCount ?? null);
      setAiMode("answer");
    } catch {
      setAiMode("actionError"); setActionMessage("Network error");
    }
  }

  async function runAction(confirm = false) {
    if (!trimmed) return;
    setAiMode(confirm ? "actionRunning" : "asking");
    try {
      const res = await fetch("/api/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: trimmed, confirm }),
      });
      const data = await res.json();
      if (data.needsConfirm) {
        setActionIntent(data.intent);
        setAiMode("actionPreview");
        return;
      }
      if (data.executed && data.redirect) {
        setActionMessage(data.message || "Done");
        setAiMode("actionDone");
        setTimeout(() => { setIsOpen(false); router.push(data.redirect); }, 500);
        return;
      }
      setActionMessage(data.message || "Could not run command");
      setAiMode("actionError");
    } catch {
      setAiMode("actionError"); setActionMessage("Network error");
    }
  }

  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href);
    },
    [router]
  );

  // Build route groups
  const pinnedRoutes = pins.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
  const recentRoutes = recents
    .filter((id) => !pins.includes(id))
    .map((id) => ROUTE_BY_ID[id])
    .filter(Boolean)
    .slice(0, 5);
  const otherRoutes = NAV_ROUTES.filter(
    (r) => !pins.includes(r.id) && !recentRoutes.some((rr) => rr.id === r.id)
  );

  return (
    <CommandCtx.Provider value={{ open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 480, damping: 34 }}
              className="relative w-full max-w-xl vibrancy-strong rounded-2xl shadow-lg overflow-hidden"
            >
              <Command shouldFilter={true} loop>
                <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border">
                  <Search size={16} className="text-fg-subtle shrink-0" />
                  <Command.Input
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search tasks or jump to a page…"
                    className="flex-1 w-full min-w-0 !bg-transparent !border-0 !rounded-none !shadow-none text-[15px] leading-6 focus:outline-none focus:!shadow-none focus:!ring-0 placeholder:text-fg-subtle"
                  />
                  <kbd className="shrink-0 text-[10px] font-mono text-fg-subtle border border-border rounded-md px-1.5 py-0.5">
                    ESC
                  </kbd>
                </div>
                <Command.List className="max-h-[460px] overflow-y-auto p-1.5">
                  <Command.Empty className="py-8 text-center text-sm text-fg-muted">
                    {trimmed ? "Hit ↵ to ask AI or use a command." : "No results."}
                  </Command.Empty>

                  {/* AI smart panel */}
                  {trimmed.length >= 3 && aiMode === null && (
                    <Command.Group
                      heading="AI"
                      className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {(isQuestion || (!isAction)) && (
                        <Command.Item
                          value={`__ai_ask__ ${trimmed}`}
                          onSelect={runAsk}
                          className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-accent/10"
                        >
                          <Sparkles size={14} className="text-accent" />
                          <span className="flex-1 truncate">Ask COS: <span className="text-fg-muted italic">"{trimmed}"</span></span>
                          <kbd className="text-[10px] font-mono text-fg-subtle">↵</kbd>
                        </Command.Item>
                      )}
                      {isAction && (
                        <Command.Item
                          value={`__ai_action__ ${trimmed}`}
                          onSelect={() => runAction(false)}
                          className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-accent/10"
                        >
                          <Zap size={14} className="text-accent" />
                          <span className="flex-1 truncate">Run command: <span className="text-fg-muted italic">"{trimmed}"</span></span>
                          <kbd className="text-[10px] font-mono text-fg-subtle">↵</kbd>
                        </Command.Item>
                      )}
                    </Command.Group>
                  )}

                  {/* AI loading */}
                  {aiMode === "asking" && (
                    <div className="px-3 py-4 flex items-center gap-2 text-sm text-fg-muted">
                      <Loader2 size={14} className="animate-spin text-accent" /> Thinking…
                    </div>
                  )}

                  {/* AI answer */}
                  {aiMode === "answer" && (
                    <div className="px-3 py-3 bg-accent/5 border border-accent/20 rounded-lg mx-1 mb-2">
                      <div className="flex items-center gap-2 mb-2 text-xs text-fg-muted">
                        <Bot size={12} className="text-accent" /> Ask COS
                        {aiTaskCount !== null && <span className="text-fg-subtle">· based on {aiTaskCount} task{aiTaskCount !== 1 ? "s" : ""}</span>}
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
                    </div>
                  )}

                  {/* Action confirmation card */}
                  {aiMode === "actionPreview" && actionIntent && (
                    <div className="px-3 py-3 bg-warn/5 border border-warn/30 rounded-lg mx-1 mb-2 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-warn">
                        <Zap size={12} /> Confirm action
                      </div>
                      <pre className="text-xs bg-bg-subtle rounded px-2 py-1.5 overflow-auto font-mono">
{JSON.stringify(actionIntent, null, 2)}
                      </pre>
                      <div className="flex gap-2">
                        <button
                          onClick={() => runAction(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          <Check size={12} /> Confirm
                        </button>
                        <button
                          onClick={resetAI}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors"
                        >
                          <XIcon size={12} /> Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {aiMode === "actionRunning" && (
                    <div className="px-3 py-4 flex items-center gap-2 text-sm text-fg-muted">
                      <Loader2 size={14} className="animate-spin text-accent" /> Running…
                    </div>
                  )}

                  {aiMode === "actionDone" && (
                    <div className="px-3 py-3 bg-success/5 border border-success/30 rounded-lg mx-1 mb-2 flex items-center gap-2 text-sm text-success font-medium">
                      <Check size={14} /> {actionMessage}
                    </div>
                  )}

                  {aiMode === "actionError" && (
                    <div className="px-3 py-3 bg-danger/5 border border-danger/30 rounded-lg mx-1 mb-2 text-sm text-danger">
                      {actionMessage}
                    </div>
                  )}

                  {/* Quick actions — launchpad (empty query only) */}
                  {!trimmed && (
                    <Command.Group
                      heading="Quick actions"
                      className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
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
                        onSelect={() => go("/?capture=1")}
                        className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                      >
                        <FilePlus2 size={14} className="text-accent" />
                        <span className="flex-1">Quick Capture</span>
                      </Command.Item>
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
                    <RouteGroup
                      heading="Pinned"
                      routes={pinnedRoutes}
                      pins={pins}
                      onGo={go}
                      onToggle={toggle}
                    />
                  )}

                  {/* Recents */}
                  {recentRoutes.length > 0 && (
                    <RouteGroup
                      heading="Recent"
                      routes={recentRoutes}
                      pins={pins}
                      onGo={go}
                      onToggle={toggle}
                      icon={<Clock size={11} />}
                    />
                  )}

                  {/* All other pages */}
                  {otherRoutes.length > 0 && (
                    <RouteGroup
                      heading="Pages"
                      routes={otherRoutes}
                      pins={pins}
                      onGo={go}
                      onToggle={toggle}
                    />
                  )}

                  {trimmed && (
                    <Command.Group
                      heading="Actions"
                      className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      <Command.Item
                        value="new task create"
                        onSelect={() => go("/task/new")}
                        className="px-2 py-2 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-bg-muted"
                      >
                        <Plus size={14} />
                        <span>New Task</span>
                      </Command.Item>
                    </Command.Group>
                  )}
                </Command.List>
                <div className="border-t border-border px-3 py-2 text-[10px] text-fg-subtle flex items-center gap-3">
                  <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                  <span><kbd className="font-mono">↵</kbd> open</span>
                  <span><kbd className="font-mono">⌘P</kbd> toggle pin</span>
                  <span className="ml-auto"><Star size={10} className="inline -mt-0.5" /> click to pin</span>
                </div>
              </Command>
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
