"use client";
import { Command } from "cmdk";
import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ListChecks, Building2, Users, Send, History, Settings, Plus, ArrowRight } from "lucide-react";

type Ctx = { open: () => void; close: () => void };
const CommandCtx = createContext<Ctx>({ open: () => {}, close: () => {} });
export const useCommandPalette = () => useContext(CommandCtx);

type SearchItem = { code: string; label: string; sub: string; href: string };

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const router = useRouter();

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

  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href);
    },
    [router]
  );

  const pages = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: ListChecks, label: "Master Registry", href: "/registry" },
    { icon: Building2, label: "Companies", href: "/companies" },
    { icon: Users, label: "People", href: "/people" },
    { icon: Send, label: "Outbox", href: "/outbox" },
    { icon: History, label: "Audit Log", href: "/audit" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  return (
    <CommandCtx.Provider value={{ open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
          <div className="absolute inset-0 bg-fg/30 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-xl rounded-lg border border-border bg-bg-elev/95 backdrop-blur-xl shadow-lg overflow-hidden">
            <Command shouldFilter={false} loop>
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Type to search tasks or jump to a page…"
                className="w-full px-4 py-3 text-sm bg-transparent border-0 border-b border-border focus:outline-none focus:ring-0"
              />
              <Command.List className="max-h-[400px] overflow-y-auto p-1.5">
                <Command.Empty className="py-6 text-center text-sm text-fg-muted">No results.</Command.Empty>

                {items.length > 0 && (
                  <Command.Group heading="Tasks" className="text-[10px] uppercase tracking-wider text-fg-subtle px-2 py-1.5">
                    {items.map((it) => (
                      <Command.Item
                        key={it.code}
                        value={`${it.code} ${it.label} ${it.sub}`}
                        onSelect={() => go(it.href)}
                        className="px-2 py-2 rounded-md flex items-center gap-3 text-sm cursor-pointer aria-selected:bg-accent-soft aria-selected:text-accent"
                      >
                        <span className="font-mono text-xs text-fg-muted w-20 shrink-0">{it.code}</span>
                        <span className="flex-1 truncate">{it.label}</span>
                        <span className="text-xs text-fg-subtle">{it.sub}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group heading="Pages" className="text-[10px] uppercase tracking-wider text-fg-subtle px-2 py-1.5">
                  {pages.map((p) => {
                    const Icon = p.icon;
                    return (
                      <Command.Item
                        key={p.href}
                        value={p.label}
                        onSelect={() => go(p.href)}
                        className="px-2 py-2 rounded-md flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-accent-soft aria-selected:text-accent"
                      >
                        <Icon size={14} />
                        <span>{p.label}</span>
                        <ArrowRight size={12} className="ml-auto opacity-50" />
                      </Command.Item>
                    );
                  })}
                </Command.Group>

                <Command.Group heading="Actions" className="text-[10px] uppercase tracking-wider text-fg-subtle px-2 py-1.5">
                  <Command.Item
                    value="new task create"
                    onSelect={() => go("/task/new")}
                    className="px-2 py-2 rounded-md flex items-center gap-2.5 text-sm cursor-pointer aria-selected:bg-accent-soft aria-selected:text-accent"
                  >
                    <Plus size={14} />
                    <span>New Task</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
              <div className="border-t border-border px-3 py-1.5 text-[10px] text-fg-subtle flex items-center gap-3">
                <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                <span><kbd className="font-mono">↵</kbd> open</span>
                <span><kbd className="font-mono">esc</kbd> close</span>
              </div>
            </Command>
          </div>
        </div>
      )}
    </CommandCtx.Provider>
  );
}
