"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  LayoutGrid,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  type LucideIcon,
} from "lucide-react";
import { adminLogout } from "@/app/login/actions";
import { moduleForPath, moduleOwnGroups, systemItems } from "@/lib/nav";
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
/** Which groups are open, per module: `{ cocozuri: ["3 · Make"] }`. Per module
 *  because the modules are different sizes and different jobs — the shape you
 *  want CocoZuri's ten groups in says nothing about Task Management's three. */
const GROUP_STORE = "cos-rail-groups";
/** The same state as a cookie, so the server can render the right gutter — see
 *  the note in `portal-sidebar.tsx`. */
export const DESK_RAIL_COOKIE = "cos-desk-rail";

type Item = { href: string; label: string; icon: LucideIcon };

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

  /* ⚠️ THE RAIL SHOWS THE MODULE YOU ARE IN, not all 24 destinations.
   *
   * Worked out from the address rather than held in state, so it is right on the
   * first paint and cannot drift out of step with the page — and `moduleForPath`
   * falls back to Task Management, so a page belonging to no module still gets a
   * rail rather than an empty column.
   *
   * A module's own `lead` links (the hub's Home and Tasks tabs) are prepended to
   * its first group. They are not NAV_ROUTES entries — they are the hub's tabs —
   * which is why they belong to Task Management and not to every module. */
  const active = moduleForPath(pathname);
  const groups: { label: string; items: Item[] }[] = moduleOwnGroups(active).map((g, i) =>
    i === 0 && active.lead ? { label: g.label, items: [...active.lead, ...g.items] } : g
  );
  /* ⚠️ SYSTEM IS PINNED, NOT SCROLLED. It belongs to the app rather than to any
   * one business, so burying it under ten groups of chocolate would be wrong —
   * and until 28 Aug 2026 that is exactly where it sat: the last entry in one
   * long scrolling column, which is not the same as being at the foot. */
  const system = systemItems();

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

  /* ⚠️ LONGEST MATCH WINS, the same rule `moduleForPath` follows.
   *
   * The old test was "exact, or a prefix", applied to each link on its own — so
   * a module's front door matched every page inside it. On /cocozuri/trace the
   * rail highlighted "CocoZuri" and Trace was left plain, which is the rail
   * answering "where am I?" with the wrong answer. It went unseen because the
   * page renders perfectly; only looking at the rail on a sub-page finds it.
   *
   * Scoring rather than the first hit, because both /ops and /ops/funnel are
   * real links and only the longer one is where you are. An exact match always
   * beats a prefix, so a front door still lights up on the front door. */
  const activeHref = useMemo(() => {
    let best: string | null = null;
    let bestScore = 0;
    const consider = (href: string) => {
      let score = 0;
      // The hub's Tasks tab is a query, not a path, so it needs its own test.
      if (href === "/?tab=tasks") score = pathname === "/" && tab === "tasks" ? 10_000 : 0;
      else if (href === "/") score = pathname === "/" && tab !== "tasks" ? 9_999 : 0;
      else if (pathname === href) score = 1_000 + href.length;
      else if (pathname.startsWith(href + "/")) score = href.length;
      if (score > bestScore) {
        bestScore = score;
        best = href;
      }
    };
    for (const g of groups) for (const it of g.items) consider(it.href);
    for (const it of system) consider(it.href);
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, tab, active.id]);

  const isActive = (href: string) => href === activeHref;

  /* ------------------------------------------------------------------ *
   * Folding the groups.
   *
   * ⚠️ THE RAIL WAS CLIPPING ITSELF IN SILENCE. Measured 28 Aug 2026 at
   * 1440×900: CocoZuri's rail stood 1281px in a 696px column, so 585px of it —
   * "5 · Sell" through "9 · Know", and every System link — was simply not there,
   * with no fade, no scrollbar and nothing to say more existed. Task Management
   * hid 141px. A rail you cannot see the bottom of is not navigation.
   *
   * So a group folds, and only the one you are working in opens by default. Your
   * choice after that is remembered per module.
   *
   * ⚠️ THE GROUP YOU ARE IN IS ALWAYS OPEN, whatever is stored. Navigating must
   * never hide where you just arrived — a rail that answers "where am I?" with a
   * folded heading is worse than one that scrolls.
   *
   * ⚠️ EVERY GROUP FOLDS, INCLUDING A GROUP OF ONE. Exempting the short ones
   * looked like the better trade — nothing to save, and a chevron over a single
   * link is friction — but on the screen it read as broken: CocoZuri has four
   * one-item groups, so "7 · Pay out" and "8 · Put right" sat open among eight
   * folded headings for no reason anybody could see. A rail whose shape you
   * cannot predict is worse than one costing a click on a page you rarely open,
   * and the group you are IN always opens by itself anyway.
   * ------------------------------------------------------------------ */
  const activeGroup = groups.find((g) => g.items.some((it) => isActive(it.href)))?.label ?? null;

  // null until the stored state is read, so the server and the first client
  // paint agree — the same trick the collapse state uses above.
  const [openGroups, setOpenGroups] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUP_STORE);
      const all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      const mine = all[active.id];
      if (Array.isArray(mine)) setOpenGroups(mine);
      else setOpenGroups(null);
    } catch { setOpenGroups(null); }
  }, [active.id]);

  const isOpen = (g: { label: string; items: Item[] }) => {
    if (collapsed) return true;
    if (g.label === activeGroup) return true;
    // Nothing stored yet: open the group you are in, and nothing else. On a page
    // that is in no group (the launcher) fall back to the first, so the rail is
    // never a column of closed headings.
    if (openGroups === null) return activeGroup === null && g.label === groups[0]?.label;
    return openGroups.includes(g.label);
  };

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups((prev) => {
      const base = prev ?? (activeGroup ? [activeGroup] : groups[0] ? [groups[0].label] : []);
      const next = base.includes(label) ? base.filter((l) => l !== label) : [...base, label];
      try {
        const raw = localStorage.getItem(GROUP_STORE);
        const all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
        all[active.id] = next;
        localStorage.setItem(GROUP_STORE, JSON.stringify(all));
      } catch { /* ignore */ }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id, activeGroup, pathname, tab]);

  /* The rail can still overflow — every group opened, or a short window — so say
   * so. A fade is the whole of it: the failure being fixed is that there was no
   * sign at all, not that scrolling is hard. */
  const navRef = useRef<HTMLElement | null>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, openGroups, collapsed, pathname]);

  // Arriving on a page whose link is below the fold used to leave the rail
  // showing the top of the module and no highlight anywhere.
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[data-rail-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [pathname, tab, openGroups]);

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
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-fg">
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

      {/* The module switcher.
       *
       * ⚠️ ONE CLICK, NOT TWO. A launcher that you reach by going "up" a level
       * first would make every page in another module cost two clicks — more
       * work than the single long rail it replaced. From here the launcher is
       * always one click away, wherever you are. */}
      <Link
        href="/apps"
        title={collapsed ? `${active.label} — switch module` : "Switch module"}
        className={cn(
          "flex items-center gap-2 border-b border-border px-3 py-2 text-sm transition-colors hover:bg-bg-subtle",
          collapsed && "justify-center px-0"
        )}
      >
        <active.icon size={15} className="shrink-0 text-accent" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{active.label}</span>
            <LayoutGrid size={13} className="shrink-0 text-fg-subtle" />
          </>
        )}
      </Link>

      {/* Create + search — the two things you reach for most. */}
      <div className={cn("flex flex-col gap-1.5 border-b border-border px-2 py-2", collapsed && "px-1.5")}>
        <CreateMenu collapsed={collapsed} />
        <button
          type="button"
          onClick={openPalette}
          title={collapsed ? "Search (Ctrl+K)" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border bg-bg-subtle/60 px-2.5 py-1.5 text-sm text-fg-subtle transition-colors hover:border-accent/40 hover:text-fg",
            collapsed ? "justify-center px-0" : ""
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

      <div className="relative min-h-0 flex-1">
        <nav
          ref={navRef}
          onScroll={measure}
          className="h-full overflow-y-auto slim-scroll px-2 py-2"
        >
          {groups.map((g) => {
            const open = isOpen(g);
            return (
              /* ⚠️ A FOLDED GROUP IS A ROW, NOT A CAPTION.
               *
               * These were 11px uppercase headings with a bare number — which is
               * how you letter a section you never touch, and they are now the
               * thing you click. Beside 13px item rows they read as a whisper
               * next to a shout, so a rail of mostly-folded groups looked broken
               * rather than tidy, and one open group among them looked lopsided.
               *
               * A group row now carries an item row's exact metrics — same
               * height, same size, same left edge — and is told apart by weight
               * (darker, medium) and by the chevron sitting where an item's icon
               * sits. Folded or open, the rail is one even list. */
              <div key={g.label} className="mb-1">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.label)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-bg-subtle"
                  >
                    <ChevronRight
                      size={14}
                      className={cn(
                        "shrink-0 text-fg-subtle transition-transform",
                        open && "rotate-90"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-left">{g.label}</span>
                    {/* Folded, the count is the only thing saying how much is
                        behind the row. Open, you can see for yourself. */}
                    {!open && (
                      <span className="shrink-0 tabular text-xs text-fg-subtle">
                        {g.items.length}
                      </span>
                    )}
                  </button>
                )}
                {open && (
                  /* ⚠️ AN OPEN GROUP'S PAGES ARE INDENTED BEHIND A HAIRLINE.
                     Flush with the group rows they read as siblings of them, not
                     as what is inside — so an open group looked like the rail had
                     simply grown three more headings. The rule starts under the
                     chevron, which is what makes the fold legible at a glance;
                     hairlines separate, which is the language everywhere else
                     here. Never indented in the 56px icon rail, where there are
                     no headings to belong to. */
                  <ul
                    className={cn(
                      "space-y-0.5",
                      !collapsed && "ms-[15px] mt-0.5 border-s border-border ps-[9px]"
                    )}
                  >
                    {g.items.map((it) => {
                      const Icon = it.icon;
                      const here = isActive(it.href);
                      return (
                        <li key={it.href}>
                          <Link
                            href={it.href}
                            data-rail-active={here ? "true" : undefined}
                            title={collapsed ? it.label : undefined}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                              collapsed && "justify-center px-0",
                              here
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
                )}
              </div>
            );
          })}
        </nav>
        {/* Purely a sign that there is more. `pointer-events-none` so it can
            never eat a click on the link underneath it. */}
        {more && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-bg-elev to-transparent" />
        )}
      </div>

      {/* System — pinned, never scrolled. See the note where `system` is built. */}
      {system.length > 0 && (
        <div className="border-t border-border px-2 py-1.5">
          {!collapsed && (
            <p className="px-2 pb-1 text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
              System
            </p>
          )}
          <ul className={cn("space-y-0.5", collapsed && "flex flex-col items-center")}>
            {system.map((it) => {
              const Icon = it.icon;
              const here = isActive(it.href);
              return (
                <li key={it.href} className={cn(!collapsed && "w-full")}>
                  <Link
                    href={it.href}
                    title={collapsed ? it.label : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      collapsed && "justify-center px-0",
                      here
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
      )}

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
            {!collapsed && <span className="truncate text-sm">Sign out</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
