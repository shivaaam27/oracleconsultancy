"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, CheckSquare, LogOut, PanelLeftClose, PanelLeftOpen, Search, type LucideIcon } from "lucide-react";
import { adminLogout } from "@/app/login/actions";
import { navGroups } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { useCommandPalette } from "./command-palette";
import { CreateMenu } from "./create-menu";
import { ThemeToggle } from "./theme-toggle";

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
/** The same state as a cookie, so the server can render the right gutter — see
 *  the note in `portal-sidebar.tsx`. */
export const DESK_RAIL_COOKIE = "cos-desk-rail";

type Item = { href: string; label: string; icon: LucideIcon };


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

export function DeskSidebar({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  // Seeded from the rail cookie by the root layout, so <main>'s gutter is right in
  // the first paint rather than one effect later. See portal-sidebar.tsx — the
  // portal hit this as a visible overlap and the fix is deliberately identical.
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // At lg+ the floating pill is hidden, so the controls it used to carry —
  // Create, search, theme and density — have to live here or they exist nowhere
  // on a desktop. Create is now the split CreateMenu: the page's own action on
  // the left, every other record type behind the caret.
  const { open: openPalette } = useCommandPalette();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORE);
      if (stored !== null) setCollapsed(stored === "1");
    } catch { /* ignore */ }
  }, []);

  // Keep <main>'s gutter in step with the live state. Written on <main> itself
  // (where the layout also sets it server-side) and never removed on cleanup —
  // removing it mid-life is what left the portal's twin overlapping after a
  // Fast Refresh remount.
  useEffect(() => {
    document.querySelector<HTMLElement>("main")
      ?.style.setProperty("--desk-sidebar", collapsed ? "56px" : "208px");
  }, [collapsed]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(STORE, next ? "1" : "0"); } catch { /* ignore */ }
      try { document.cookie = `${DESK_RAIL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
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
        <CreateMenu collapsed={collapsed} />
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

      {/* The footer row: theme, then sign out beside it.
       *
       * The DENSITY toggle used to sit here and was removed (Aug 2026, owner's
       * call): Compact IS the design — it is what makes this ERPNext-shaped —
       * and a switch back to Comfortable only made the app look less like the
       * thing it was rebuilt to be. Nothing was deleted underneath: the
       * `data-density` CSS and `DensityScript` still run and still pin the admin
       * side to Compact, so putting the button back is one line if it is ever
       * wanted.
       *
       * Sign out used to live only at the bottom of Settings → Security, which
       * is a long way to go to lock your own screen. `adminLogout` is the same
       * server action that button calls — clears the cookie, sends you to
       * /login. No confirm: it is one of the few things you undo by signing back
       * in. */}
      <div
        className={cn(
          "flex items-center gap-1 border-t border-border px-2 py-1.5",
          collapsed && "flex-col gap-0.5 px-0"
        )}
      >
        <ThemeToggle />
        <form action={adminLogout} className={cn(!collapsed && "flex-1")}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger",
              collapsed ? "justify-center" : "w-full"
            )}
          >
            <LogOut size={14} className="shrink-0" />
            {!collapsed && <span className="truncate text-[12px]">Sign out</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
