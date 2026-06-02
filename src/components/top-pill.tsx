"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { cloneElement, isValidElement, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Home, CheckSquare, Building2, NotebookPen, LayoutGrid, Search,
  Users, Send, Inbox, BarChart3, Settings, Plus, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { useRegisteredActions, type ContextAction } from "./context-actions";
import { triggerHaptic } from "@/lib/use-long-press";

type Company = { id: number; name: string; accent: string | null };

/* --------------------------------------------------------------------- */

/** A primary nav tab — icon only, filled-accent pill when active. */
function NavTab({
  href, icon: Icon, label, active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex items-center justify-center h-10 w-10 rounded-full shrink-0 transition-colors",
        active ? "text-accent" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
      )}
    >
      {active && (
        <motion.span
          layoutId="navpill"
          className="absolute inset-0 rounded-full bg-accent-soft"
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
        />
      )}
      <Icon size={20} strokeWidth={active ? 2.4 : 2} className="relative" />
    </Link>
  );
}

/* --------------------------------------------------------------------- */
/* Companies tab — tap opens the index; press-and-hold opens a popup of    */
/* companies that you can release-to-select or tap.                        */
/* --------------------------------------------------------------------- */

function CompaniesNavTab({ companies, active }: { companies: Company[]; active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  function go(id: number) { setOpen(false); setHighlight(null); router.push(`/companies/${id}`); }

  function onPointerDown(e: React.PointerEvent) {
    held.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => { held.current = true; triggerHaptic(); setOpen(true); }, 300);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!open) {
      // cancel the long-press if the finger drifts before it fires
      if (start.current && (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8)) clear();
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const item = el?.closest("[data-company-id]");
    setHighlight(item ? Number(item.getAttribute("data-company-id")) : null);
  }
  function onPointerUp(e: React.PointerEvent) {
    clear();
    if (open && held.current) {
      // release-to-select
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const item = el?.closest("[data-company-id]");
      if (item) { go(Number(item.getAttribute("data-company-id"))); return; }
      // released elsewhere → keep the popup open so they can tap
      return;
    }
    // quick tap → company index
    if (!held.current) { setOpen(false); router.push("/companies"); }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Companies"
        title="Companies — hold for list"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative inline-flex items-center justify-center h-10 w-10 rounded-full transition-colors select-none touch-none",
          active ? "text-accent" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
        )}
      >
        {active && (
          <motion.span layoutId="navpill" className="absolute inset-0 rounded-full bg-accent-soft" transition={{ type: "spring", stiffness: 500, damping: 36 }} />
        )}
        <Building2 size={20} strokeWidth={active ? 2.4 : 2} className="relative" />
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-[55] cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute z-[56] bottom-full mb-3 left-1/2 -translate-x-1/2 w-60 max-w-[calc(100vw-2rem)] glass glass-menu elevated rounded-2xl p-1.5 max-h-[58vh] overflow-y-auto shadow-lg">
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-subtle">Companies</div>
            <Link
              href="/companies"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
            >
              <LayoutGrid size={14} className="shrink-0" /> All companies
            </Link>
            <div className="my-1 h-px bg-border/60" />
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                data-company-id={c.id}
                onClick={() => go(c.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left transition-colors",
                  highlight === c.id ? "bg-accent-soft text-fg" : "text-fg hover:bg-bg-muted/60"
                )}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.accent || "hsl(var(--fg-subtle))" }} />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* "More" sheet — the secondary destinations                              */
/* --------------------------------------------------------------------- */

const MORE: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/people", label: "People", icon: Users },
  { href: "/outbox", label: "Outbox", icon: Send },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function MoreSheet({ pathname }: { pathname: string }) {
  const active = MORE.some((r) => pathname === r.href || pathname.startsWith(r.href + "/"));
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="More"
          title="More"
          className={cn(
            "relative inline-flex items-center justify-center h-10 w-10 rounded-full shrink-0 transition-colors outline-none",
            active ? "text-accent" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
          )}
        >
          {active && (
            <motion.span layoutId="navpill" className="absolute inset-0 rounded-full bg-accent-soft" transition={{ type: "spring", stiffness: 500, damping: 36 }} />
          )}
          <LayoutGrid size={20} className="relative" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          sideOffset={12}
          align="center"
          className="z-[60] w-[260px] glass glass-menu rounded-2xl p-2 shadow-lg"
        >
          <DropdownMenu.Label className="px-2 py-1 text-[10px] uppercase tracking-wider text-fg-subtle">More</DropdownMenu.Label>
          <div className="grid grid-cols-3 gap-1">
            {MORE.map((r) => {
              const Icon = r.icon;
              const isActive = pathname === r.href || pathname.startsWith(r.href + "/");
              return (
                <DropdownMenu.Item key={r.href} asChild>
                  <Link
                    href={r.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl text-[11px] outline-none cursor-pointer transition-colors",
                      isActive ? "bg-accent-soft text-accent font-medium" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
                    )}
                  >
                    <Icon size={17} />
                    {r.label}
                  </Link>
                </DropdownMenu.Item>
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* --------------------------------------------------------------------- */
/* Page action — the current page's primary contextual action, surfaced as */
/* a single icon in the nav pill. Mirrors the action's own icon; fires it   */
/* directly when there's one, opens a small popover when there are several. */
/* --------------------------------------------------------------------- */

function navIcon(action: ContextAction) {
  return isValidElement(action.icon)
    ? cloneElement(action.icon as React.ReactElement<{ size?: number }>, { size: 19 })
    : <Plus size={19} />;
}

function NavActionButton() {
  const { actions, suppressed } = useRegisteredActions();
  const [open, setOpen] = useState(false);

  // No action registered for this page (or hidden behind an overlay) → nothing.
  if (actions.length === 0 || suppressed) return null;

  const primary = actions.find((a) => a.primary) ?? actions[0];
  const btn = "shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full text-accent hover:bg-bg-muted/60 transition-colors";

  // Single action → fire directly.
  if (actions.length === 1) {
    if (primary.href) {
      return <Link href={primary.href} aria-label={primary.label} title={primary.label} className={btn}>{navIcon(primary)}</Link>;
    }
    return (
      <button type="button" onClick={primary.onClick} aria-label={primary.label} title={primary.label} className={btn}>
        {navIcon(primary)}
      </button>
    );
  }

  // Several actions → popover above the pill.
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Page actions" title={primary.label} className={btn}>
        {navIcon(primary)}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-[55] cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute z-[56] bottom-full mb-3 right-0 w-56 max-w-[calc(100vw-2rem)] glass glass-menu elevated rounded-2xl p-1.5 shadow-lg">
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-subtle">Actions</div>
            {actions.map((a) => {
              const row = "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left text-fg hover:bg-bg-muted/60 transition-colors";
              const inner = (
                <>
                  <span className={cn("shrink-0", a.tone === "danger" ? "text-danger" : a.primary ? "text-accent" : "text-fg-muted")}>
                    {isValidElement(a.icon) ? cloneElement(a.icon as React.ReactElement<{ size?: number }>, { size: 15 }) : <Plus size={15} />}
                  </span>
                  <span className="truncate">{a.label}</span>
                </>
              );
              return a.href ? (
                <Link key={a.id} href={a.href} onClick={() => setOpen(false)} className={row}>{inner}</Link>
              ) : (
                <button key={a.id} type="button" onClick={() => { setOpen(false); a.onClick?.(); }} className={row}>{inner}</button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* The bottom-floating pill (mobile only)                                 */
/* --------------------------------------------------------------------- */

export function TopPill({ companies = [] }: { companies?: Company[] }) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const { open: openPalette } = useCommandPalette();

  const onHub = pathname === "/";
  const homeActive = onHub && tab !== "tasks";
  const tasksActive = onHub && tab === "tasks";
  const companiesActive = pathname.startsWith("/companies");
  const workbookActive = pathname.startsWith("/workbook");

  return (
    <div className="md:hidden fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-2 pointer-events-none">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="pointer-events-auto glass elevated rounded-full shadow-pill flex items-center gap-0.5 px-1.5 h-14"
      >
        <NavTab href="/" icon={Home} label="Home" active={homeActive} />
        <NavTab href="/?tab=tasks" icon={CheckSquare} label="Task Management" active={tasksActive} />
        <CompaniesNavTab companies={companies} active={companiesActive} />
        <NavTab href="/workbook" icon={NotebookPen} label="Workbook" active={workbookActive} />
        <MoreSheet pathname={pathname} />

        <span className="w-px h-6 bg-border mx-0.5 shrink-0" aria-hidden />

        <NavActionButton />

        <button
          onClick={openPalette}
          className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
          aria-label="Search"
          title="Search (⌘K)"
        >
          <Search size={19} />
        </button>

        <div className="shrink-0 flex items-center">
          <ThemeToggle />
        </div>
      </motion.div>
    </div>
  );
}
