"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Home, CheckSquare, Inbox, NotebookPen, BarChart3,
  Users, Send, Settings, Search, ChevronRight, Building2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";

type Company = { id: number; name: string; code: string };

const NAV = [
  { label: "Home", href: "/", icon: Home, match: (p: string, tab: string | null) => p === "/" && tab !== "tasks" && tab !== "companies" },
  { label: "Tasks", href: "/?tab=tasks", icon: CheckSquare, match: (p: string, tab: string | null) => p === "/" && tab === "tasks" },
];

const NAV_BELOW = [
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Workbook", href: "/workbook", icon: NotebookPen },
  { label: "Insights", href: "/insights", icon: BarChart3 },
  { label: "People", href: "/people", icon: Users },
  { label: "Outbox", href: "/outbox", icon: Send },
];

function Item({
  href, icon: Icon, label, active, indent, onNavigate,
}: {
  href: string; icon?: React.ComponentType<{ size?: number; className?: string }>; label: string; active: boolean; indent?: boolean; onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-all relative",
        indent && "pl-9",
        active
          ? "bg-accent/15 text-accent font-medium ring-1 ring-accent/20"
          : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
      )}
    >
      {active && !indent && (
        <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
      )}
      {Icon && <Icon size={15} className={cn("shrink-0 transition-transform", active && "scale-110")} />}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** The shared sidebar body — used by the desktop rail and the mobile drawer. */
export function SidebarContent({ companies, onNavigate }: { companies: Company[]; onNavigate?: () => void }) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const { open: openPalette } = useCommandPalette();
  const [companiesOpen, setCompaniesOpen] = useState(true);

  const onCompaniesIndex = pathname === "/companies" || (pathname === "/" && tab === "companies");

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-3.5 h-14 border-b border-border shrink-0">
        <span
          className="relative w-8 h-8 rounded-xl bg-accent flex items-center justify-center shadow-md shadow-accent/30 ring-1 ring-white/10 overflow-hidden"
        >
          <span aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-black/20" />
          <Sparkles size={16} className="relative text-accent-fg" />
        </span>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">AUMIO</span>
          <span className="text-[10px] text-fg-subtle">Oracle Group</span>
        </div>
      </Link>

      {/* Search — top of the rail */}
      <div className="px-2 pt-3">
        <button
          onClick={() => { onNavigate?.(); openPalette(); }}
          className="w-full inline-flex items-center gap-2.5 rounded-md border border-border bg-bg-elev px-2.5 py-1.5 text-[13px] text-fg-muted hover:text-fg hover:bg-bg-muted/60 btn-rim transition-colors"
        >
          <Search size={15} className="shrink-0" /> Search
          <kbd className="ml-auto text-[10px] font-mono text-fg-subtle border border-border rounded px-1 py-0.5">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map((n) => (
          <Item key={n.label} href={n.href} icon={n.icon} label={n.label} active={n.match(pathname, tab)} onNavigate={onNavigate} />
        ))}

        {/* Companies — a normal nav item that fluidly expands its list. */}
        <button
          type="button"
          onClick={() => setCompaniesOpen((o) => !o)}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors",
            onCompaniesIndex ? "bg-accent/15 text-accent font-medium ring-1 ring-accent/20" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
          )}
        >
          <Building2 size={15} className="shrink-0" />
          <span className="truncate">Companies</span>
          <ChevronRight size={14} className={cn("ml-auto transition-transform", companiesOpen && "rotate-90")} />
        </button>
        <AnimatePresence initial={false}>
          {companiesOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-0.5 space-y-0.5">
                <Item href="/companies" label="All companies" indent active={onCompaniesIndex} onNavigate={onNavigate} />
                {companies.map((c) => (
                  <Item key={c.id} href={`/companies/${c.id}`} label={c.name} indent active={pathname === `/companies/${c.id}`} onNavigate={onNavigate} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-2 mt-2 border-t border-border space-y-0.5">
          {NAV_BELOW.map((n) => (
            <Item key={n.label} href={n.href} icon={n.icon} label={n.label} active={pathname === n.href || pathname.startsWith(n.href + "/")} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>

      {/* Footer: settings (where search used to be) + theme */}
      <div className="border-t border-border p-2 flex items-center gap-1 shrink-0">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex-1 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
            pathname === "/settings" ? "bg-accent/15 text-accent font-medium glass-rim" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
          )}
        >
          <Settings size={15} className="shrink-0" /> Settings
        </Link>
        <ThemeToggle />
      </div>
    </div>
  );
}

/** Desktop sidebar rail (md+). */
export function Sidebar({ companies }: { companies: Company[] }) {
  return (
    <aside className="hidden md:block w-56 lg:w-60 shrink-0 border-r border-border bg-gradient-to-b from-accent/5 via-bg-subtle/50 to-bg-subtle/20 md:h-[100svh] md:sticky md:top-0">
      <SidebarContent companies={companies} />
    </aside>
  );
}
