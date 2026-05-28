"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Sparkles, Search, LayoutGrid, PinOff, Pin } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ROUTES, ROUTE_BY_ID, type NavRoute } from "@/lib/nav";
import { usePins } from "@/lib/use-pins";
import { useCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";

/* --------------------------------------------------------------------- */

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/* --------------------------------------------------------------------- */
/* One pinned icon chip — square, icon-only, right-click to unpin        */
/* --------------------------------------------------------------------- */

function PinnedIcon({
  route,
  active,
  onUnpin,
}: {
  route: NavRoute;
  active: boolean;
  onUnpin: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = route.icon;

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <Link
          href={route.href}
          aria-label={route.label}
          title={route.label}
          // Left-click = navigate, right-click = open the unpin menu
          onPointerDown={(e) => {
            if (e.button === 0) e.preventDefault();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpen(true);
          }}
          className={cn(
            "relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors outline-none shrink-0",
            active
              ? "bg-accent-soft text-fg"
              : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
          )}
        >
          {active && (
            <motion.span
              layoutId="pill-active"
              className="absolute inset-0 rounded-full bg-accent-soft"
              transition={{ type: "spring", stiffness: 500, damping: 36 }}
            />
          )}
          <Icon size={16} strokeWidth={active ? 2.4 : 2} className="relative" />
        </Link>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          sideOffset={10}
          align="center"
          className="z-[60] min-w-[160px] vibrancy-strong rounded-xl p-1 shadow-lg text-sm"
        >
          <DropdownMenu.Label className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-subtle">
            {route.label}
          </DropdownMenu.Label>
          <DropdownMenu.Item
            onSelect={onUnpin}
            className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none text-danger data-[highlighted]:bg-danger-soft"
          >
            <PinOff size={14} /> Unpin
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* --------------------------------------------------------------------- */
/* Browse-all popover — every route as a small grid tile                  */
/* Tap toggles pin. Stays open so you can pin several in a row.           */
/* --------------------------------------------------------------------- */

function BrowseRoutes({
  pinnedIds,
  activeHref,
  onToggle,
  hasActiveUnpinned,
}: {
  pinnedIds: Set<string>;
  activeHref: string;
  onToggle: (id: string) => void;
  hasActiveUnpinned: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors shrink-0",
            "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
          )}
          aria-label="Browse all routes"
          title="Browse all routes"
        >
          <LayoutGrid size={16} />
          {hasActiveUnpinned && (
            <span
              className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent"
              aria-label="You're on an unpinned route"
            />
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          sideOffset={10}
          align="center"
          className="z-[60] w-[300px] vibrancy-strong rounded-xl shadow-lg overflow-hidden text-sm"
          // Keep open across rapid pin toggles
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
              All routes
            </div>
            <div className="text-[10px] text-fg-subtle">
              {pinnedIds.size} pinned
            </div>
          </div>
          <div className="p-2 grid grid-cols-3 gap-1">
            {NAV_ROUTES.map((r) => {
              const Icon = r.icon;
              const isPinned = pinnedIds.has(r.id);
              const isActiveRoute = isActive(activeHref, r.href);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onToggle(r.id);
                  }}
                  className={cn(
                    "group relative flex flex-col items-center justify-center gap-1 h-16 rounded-lg transition-colors px-1",
                    isPinned
                      ? "bg-accent-soft text-fg"
                      : "hover:bg-bg-muted text-fg-muted hover:text-fg",
                    isActiveRoute && !isPinned && "ring-1 ring-accent/40"
                  )}
                  title={isPinned ? `Unpin ${r.label}` : `Pin ${r.label}`}
                  aria-pressed={isPinned}
                >
                  <Icon size={15} />
                  <span className="text-[11px] leading-none truncate w-full text-center">
                    {r.label}
                  </span>
                  {isPinned && (
                    <Pin
                      size={9}
                      className="absolute top-1 right-1 text-accent fill-accent"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-border text-[10px] text-fg-subtle text-center leading-relaxed">
            Tap a tile to pin or unpin · right-click any pinned chip for the same
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* --------------------------------------------------------------------- */
/* The bottom-floating pill                                               */
/* --------------------------------------------------------------------- */

export function TopPill({ scopeSlot }: { scopeSlot?: React.ReactNode } = {}) {
  const pathname = usePathname() || "/";
  const { pins, toggle } = usePins();
  const { open: openPalette } = useCommandPalette();

  const pinnedRoutes = useMemo(
    () => pins.map((id) => ROUTE_BY_ID[id]).filter(Boolean) as NavRoute[],
    [pins]
  );
  const pinnedIds = useMemo(() => new Set(pins), [pins]);

  // Highlight the browse button when the active page is not in the pinned set,
  // so users still get a hint of "where am I" when working on an unpinned route.
  // Home ("/") is reached via the brand button, so it never counts as "unpinned".
  const hasActiveUnpinned = useMemo(() => {
    if (pathname === "/") return false;
    return !pinnedRoutes.some((r) => isActive(pathname, r.href));
  }, [pinnedRoutes, pathname]);

  return (
    <div className="fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 pointer-events-none">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="pointer-events-auto vibrancy-strong rounded-full shadow-pill flex items-center gap-1 px-2 h-12 max-w-[min(96vw,920px)] w-auto"
      >
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-1.5 pl-2 pr-2.5 h-9 rounded-full hover:bg-bg-muted/60 transition-colors shrink-0"
          aria-label="Dashboard"
          title="COS · Dashboard"
        >
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
            <Sparkles size={13} className="text-accent-fg" />
          </div>
          <span className="text-[14px] font-semibold tracking-tight hidden sm:inline">COS</span>
        </Link>

        <span className="w-px h-6 bg-border mx-0.5 shrink-0" aria-hidden />

        {/* Pinned icon rail (horizontal scroll on overflow) */}
        <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar">
          <AnimatePresence initial={false}>
            {pinnedRoutes.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="shrink-0"
              >
                <PinnedIcon
                  route={r}
                  active={isActive(pathname, r.href)}
                  onUnpin={() => toggle(r.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Browse all */}
        <BrowseRoutes
          pinnedIds={pinnedIds}
          activeHref={pathname}
          onToggle={toggle}
          hasActiveUnpinned={hasActiveUnpinned}
        />

        <span className="w-px h-6 bg-border mx-0.5 shrink-0" aria-hidden />

        {/* Scope */}
        {scopeSlot}

        <span className="w-px h-6 bg-border mx-0.5 shrink-0" aria-hidden />

        {/* Search / palette */}
        <button
          onClick={openPalette}
          className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
          aria-label="Search"
          title="Search (⌘K)"
        >
          <Search size={16} />
        </button>

        {/* Theme */}
        <div className="shrink-0 pl-0.5 flex items-center">
          <ThemeToggle />
        </div>
      </motion.div>
    </div>
  );
}
