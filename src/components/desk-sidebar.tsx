"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, CheckSquare, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { NAV_ROUTES } from "@/lib/nav";
import { cn } from "@/lib/cn";

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

function route(id: string): Item | null {
  const r = NAV_ROUTES.find((x) => x.id === id);
  return r ? { href: r.href, label: r.label, icon: r.icon } : null;
}

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/?tab=tasks", label: "Tasks", icon: CheckSquare },
      ...["approvals", "outbox", "calendar", "announcements"].map(route).filter(Boolean) as Item[],
    ],
  },
  {
    label: "Records",
    items: ["people", "companies", "documents", "assets"].map(route).filter(Boolean) as Item[],
  },
  {
    label: "Registers",
    items: ["tax-legal", "registers", "leave", "oecr", "ocr"].map(route).filter(Boolean) as Item[],
  },
  {
    label: "System",
    items: ["insights", "activity", "ori-automations", "settings"].map(route).filter(Boolean) as Item[],
  },
];

export function DeskSidebar() {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);

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
    </aside>
  );
}
