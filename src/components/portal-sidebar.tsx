"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { portalNavGroups, isPortalItemActive, type PortalTabOverrides } from "@/lib/portal-nav";
import { cn } from "@/lib/cn";

/**
 * The staff portal's desktop sidebar — the twin of `desk-sidebar.tsx`.
 *
 * The portal had only the floating pill, on every screen. That is right on a
 * phone and wasteful on a monitor, where the directors actually work: a fixed
 * rail costs nothing horizontally and puts every destination one click away
 * instead of behind a scrolling row of icons. It also makes the portal read as
 * the SAME product as the command centre, which is the whole point of this pass.
 *
 * It shows from `lg` up, and the pill hides at that width (see portal-pill.tsx)
 * — exactly the arrangement the admin side uses.
 *
 * ⚠️ It publishes `--portal-sidebar` on <html>, NOT `--desk-sidebar`. The two
 * must stay separate: the admin gutter reads its own variable, and a portal page
 * that overwrote it would shove the command centre's layout about on the next
 * navigation.
 *
 * Its items come from `portalNavItems`, the one map the pill also reads, so a
 * destination can never exist in one navigation and be missing from the other.
 */

const STORE = "cos-portal-sidebar";
/** Same state, as a cookie, so the SERVER can render the right gutter. localStorage
 *  cannot be read during SSR, which is why the width used to arrive one paint late. */
export const RAIL_COOKIE = "cos-portal-rail";

export function PortalSidebar({
  role,
  tabOverrides,
  canOri,
  name,
  subtitle,
  initialCollapsed = false,
}: {
  role?: string;
  tabOverrides?: PortalTabOverrides;
  /** Show the ORI search entry — same capability gate the pill uses. */
  canOri?: boolean;
  name: string;
  subtitle: string;
  /** Read from the rail cookie by the layout, so the first paint is already the
   *  right width — do NOT default this to `false` at the call site. */
  initialCollapsed?: boolean;
}) {
  const pathname = usePathname() || "/portal";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const groups = portalNavGroups(role, tabOverrides);

  useEffect(() => {
    // localStorage stays authoritative for anyone whose cookie predates it.
    try {
      const stored = localStorage.getItem(STORE);
      if (stored !== null) setCollapsed(stored === "1");
    } catch { /* ignore */ }
  }, []);

  // Keep the gutter in step with the live state. It is written on the SHELL, not
  // on <html>: the layout sets the same custom property inline there, and an
  // element's own property beats one inherited from the root — so writing to
  // <html> would silently do nothing. No cleanup that removes it, either: the
  // shell's server-rendered value is the floor, and removing the property mid-life
  // (a Fast Refresh remount does exactly that) is what left pages overlapped.
  useEffect(() => {
    document.querySelector<HTMLElement>("[data-portal-shell]")
      ?.style.setProperty("--portal-sidebar", collapsed ? "56px" : "208px");
  }, [collapsed]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(STORE, next ? "1" : "0"); } catch { /* ignore */ }
      // A year, path=/ so every portal route sees it, Lax because this is a
      // preference and never travels with a cross-site request.
      try { document.cookie = `${RAIL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <aside
      data-portal-sidebar
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-border bg-bg-elev lg:flex",
        collapsed ? "w-[56px]" : "w-[208px]"
      )}
    >
      <div className={cn("flex items-center gap-2 border-b border-border px-3 py-2.5", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold tracking-tight text-fg">{name}</span>
            <span className="block truncate text-xs uppercase tracking-[0.12em] text-fg-subtle">{subtitle}</span>
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {canOri && (
        <div className={cn("border-b border-border px-2 py-2", collapsed && "px-1.5")}>
          <button
            type="button"
            // The command surface is mounted once by the portal layout and
            // listens for this event — the same trigger the pill uses.
            onClick={() => window.dispatchEvent(new CustomEvent("cos:portal-ori"))}
            title={collapsed ? "Search (Ctrl+K)" : undefined}
            className={cn(
              "inline-flex h-7 w-full items-center gap-2 rounded-md border border-border bg-bg-subtle/60 px-2.5 text-sm text-fg-subtle transition-colors hover:border-accent/40 hover:text-fg",
              collapsed && "justify-center px-0"
            )}
          >
            <Search size={14} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="truncate">Search</span>
                <span className="ml-auto shrink-0 text-xs text-fg-subtle">⌘K</span>
              </>
            )}
          </button>
        </div>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto slim-scroll px-2 py-2">
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            {!collapsed && (
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
                {g.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = isPortalItemActive(it, pathname);
                return (
                  <li key={it.id}>
                    <Link
                      href={it.href}
                      title={collapsed ? it.label : undefined}
                      data-tour={it.tourTag}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
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
