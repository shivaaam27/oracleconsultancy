"use client";
import { Command } from "cmdk";
import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowRight, Pin, PinOff, Search, Clock, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ROUTES, ROUTE_BY_ID } from "@/lib/nav";
import { usePins } from "@/lib/use-pins";

type Ctx = { open: () => void; close: () => void };
const CommandCtx = createContext<Ctx>({ open: () => {}, close: () => {} });
export const useCommandPalette = () => useContext(CommandCtx);

type SearchItem = { code: string; label: string; sub: string; href: string };

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const { pins, toggle } = usePins();
  const router = useRouter();

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

  // Reset query on close
  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

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
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <Search size={14} className="text-fg-subtle" />
                  <Command.Input
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search tasks or jump to a page…"
                    className="flex-1 bg-transparent border-0 text-sm focus:outline-none focus:ring-0 placeholder:text-fg-subtle"
                  />
                  <kbd className="text-[10px] font-mono text-fg-subtle border border-border rounded-md px-1.5 py-0.5">
                    ESC
                  </kbd>
                </div>
                <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
                  <Command.Empty className="py-8 text-center text-sm text-fg-muted">
                    No results.
                  </Command.Empty>

                  {/* Tasks (from server search) */}
                  {items.length > 0 && (
                    <Command.Group
                      heading="Tasks"
                      className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {items.map((it) => (
                        <Command.Item
                          key={it.code}
                          value={`${it.code} ${it.label} ${it.sub}`}
                          onSelect={() => go(it.href)}
                          className="px-2 py-2 rounded-lg flex items-center gap-3 text-sm cursor-pointer aria-selected:bg-bg-muted"
                        >
                          <span className="font-mono text-xs text-fg-muted w-20 shrink-0">{it.code}</span>
                          <span className="flex-1 truncate">{it.label}</span>
                          <span className="text-xs text-fg-subtle">{it.sub}</span>
                        </Command.Item>
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
