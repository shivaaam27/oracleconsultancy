"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, CheckSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, type LucideIcon } from "lucide-react";
import { navGroups } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { useCommandPalette } from "./command-palette";
import { useRegisteredActions } from "./context-actions";
import { ThemeToggle } from "./theme-toggle";
import { DensityToggle } from "./density-toggle";

/**
 * The persistent left sidebar — ERPNext's workspace rail.
 *
 * The owner asked for this once the redesign stages were done: a permanent nav
 * column instead of hunting through the floating pill's launcher. It shows from
 * `lg` up and replaces the vertical side pill there; below `lg` the bottom pill
 * is still the navigation, because a fixed rail on a phone is dead weight.
 *
 * Grouped the way the work is grouped, not the way the routes happen to be
 * ordered. Collapsing it leaves the icons, and the choice is remembered.
 *
 * The width is published as `--desk-sidebar` on <html> so the layout's gutter
 * follows it — see globals.css.
 */

const STORE = "cos-sidebar";

type Item = { href: string; label: string; icon: LucideIcon };

/** The filled blue Create button — same skin whether it links or fires an action. */
const createSkin = (collapsed: boolean) =>
  cn(
    "inline-flex items-center gap-2 rounded-lg bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-accent-fg transition-opacity hover:opacity-90",
    collapsed && "justify-center px-0"
  );


/* The grouping lives in lib/nav.ts so the mobile launcher shows the SAME map.
   Home and Tasks are prepended here because they are the hub's own tabs, not
   NAV_ROUTES entries. */
const GROUPS: { label: string; items: Item[] }[] = navGroups().map((g) =>
  g.label === "Work"
    ? {
        label: g.label,
        items: [
          { href: "/", label: "Home", icon: Home },
          { href: "/?tab=tasks", label: "Tasks", icon: CheckSquare },
          ...g.items,
        ],
      }
    : g
);

export function DeskSidebar() {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  // At lg+ the floating pill is hidden, so the controls it used to carry —
  // Create, search, theme and density — have to live here or they exist nowhere
  // on a desktop.
  const { open: openPalette } = useCommandPalette();
  const { actions } = useRegisteredActions();
  // Use the page's own create action when it HAS one — "Add asset" on Assets,
  // "New Task" on a company. A page's primary action is not always a create,
  // though: the task record's is "Draft email", which behind a + button read as
  // "create a draft email". So match on intent, and fall back to New task so the
  // button is never missing and never lies.
  const pageCreate = actions.find((a) => /\b(new|create|add|raise)\b/i.test(a.label));
  const create: { label: string; href?: string; onClick?: () => void } =
    pageCreate ?? { label: "New task", href: "/task/new" };

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORE) === "1"); } catch { /* ignore */ }
  }, []);

  // Publish the width so <main>'s gutter matches whatever state we are in.
  useEffect(() => {
    document.documentElement.style.setProperty("--desk-sidebar", collapsed ? "56px" : "208px");
    return () => {
      document.documentElement.style.removeProperty("--desk-sidebar");
    };
  }, [collapsed]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(STORE, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  // The hub's Tasks tab is a query, not a path, so it needs its own test.
  const tab = params.get("tab");
  function isActive(href: string) {
    if (href === "/?tab=tasks") return pathname === "/" && tab === "tasks";
    if (href === "/") return pathname === "/" && tab !== "tasks";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      data-desk-sidebar
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-border bg-bg-elev lg:flex",
        collapsed ? "w-[56px]" : "w-[208px]"
      )}
    >
      <div className={cn("flex items-center gap-2 border-b border-border px-3 py-2.5", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-tight text-fg">
            Oracle Consultancy
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* Create + search — the two things you reach for most. */}
      <div className={cn("flex flex-col gap-1.5 border-b border-border px-2 py-2", collapsed && "px-1.5")}>
        {create.href ? (
          <Link href={create.href} title={collapsed ? create.label : undefined} className={createSkin(collapsed)}>
            <Plus size={14} className="shrink-0" />
            {!collapsed && <span className="truncate">{create.label}</span>}
          </Link>
        ) : (
          <button type="button" onClick={create.onClick} title={collapsed ? create.label : undefined} className={createSkin(collapsed)}>
            <Plus size={14} className="shrink-0" />
            {!collapsed && <span className="truncate">{create.label}</span>}
          </button>
        )}
        <button
          type="button"
          onClick={openPalette}
          title={collapsed ? "Search (Ctrl+K)" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border bg-bg-subtle/60 px-2.5 py-1.5 text-[12.5px] text-fg-subtle transition-colors hover:border-accent/40 hover:text-fg",
            collapsed ? "justify-center px-0" : ""
          )}
        >
          <Search size={14} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">Search</span>
              <span className="ml-auto shrink-0 text-[10px] text-fg-subtle">⌘K</span>
            </>
          )}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto slim-scroll px-2 py-2">
        {GROUPS.map((g) => (
          <div key={g.label} className="mb-3">
            {!collapsed && (
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
                {g.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      title={collapsed ? it.label : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                      )}
                    >
                      <Icon size={14} className="shrink-0" />
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Appearance — the pill carried these below lg; on desktop they live here. */}
      <div
        className={cn(
          "flex items-center gap-1 border-t border-border px-2 py-1.5",
          collapsed && "flex-col gap-0.5 px-0"
        )}
      >
        <ThemeToggle />
        <DensityToggle />
      </div>
    </aside>
  );
}
