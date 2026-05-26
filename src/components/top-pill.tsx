"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import {
  MoreHorizontal,
  Pin,
  PinOff,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  GripVertical,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { NAV_ROUTES, ROUTE_BY_ID, type NavRoute } from "@/lib/nav";
import { usePins } from "@/lib/use-pins";
import { useCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { DensityToggle } from "./density-toggle";

/* --------------------------------------------------------------------- */

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/* --------------------------------------------------------------------- */
/* Chip — Reorder.Item with imperative ref forwarded out for measurement */
/* --------------------------------------------------------------------- */

type ChipProps = {
  route: NavRoute;
  active: boolean;
  onUnpin: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
};

function PillChip({
  route,
  active,
  onUnpin,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
}: ChipProps) {
  const controls = useDragControls();
  const Icon = route.icon;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Reorder.Item
      value={route.id}
      dragListener={false}
      dragControls={controls}
      as="div"
      className="relative shrink-0"
      whileDrag={{ scale: 1.04, zIndex: 5 }}
      transition={{ type: "spring", stiffness: 500, damping: 36 }}
    >
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger asChild>
          <Link
            href={route.href}
            // Stop Radix from opening on normal left-click; allow navigation.
            onPointerDown={(e) => {
              if (e.button === 0) e.preventDefault();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuOpen(true);
            }}
            className={cn(
              "group relative inline-flex items-center gap-1.5 h-8 pl-1.5 pr-3 rounded-full text-[13px] transition-colors",
              "select-none whitespace-nowrap outline-none",
              active ? "text-fg" : "text-fg-muted hover:text-fg"
            )}
          >
            {active && (
              <motion.span
                layoutId="pill-active"
                className="absolute inset-0 rounded-full bg-accent-soft"
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
              />
            )}
            {/* Drag handle — stops navigation, starts drag */}
            <span
              role="button"
              aria-label="Drag to reorder"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                controls.start(e);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="relative opacity-0 group-hover:opacity-60 transition-opacity cursor-grab active:cursor-grabbing -ml-0.5"
            >
              <GripVertical size={12} />
            </span>
            <Icon size={13} strokeWidth={active ? 2.4 : 2} className="relative" />
            <span className={cn("relative", active && "font-medium")}>{route.label}</span>
          </Link>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={8}
            align="center"
            className="z-[60] min-w-[160px] vibrancy-strong rounded-xl p-1 shadow-lg text-sm"
          >
            <DropdownMenu.Item
              onSelect={onMoveLeft}
              disabled={!canMoveLeft}
              className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-40 data-[disabled]:pointer-events-none"
            >
              <ChevronLeft size={14} /> Move left
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={onMoveRight}
              disabled={!canMoveRight}
              className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-40 data-[disabled]:pointer-events-none"
            >
              <ChevronRight size={14} /> Move right
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="h-px bg-border my-1" />
            <DropdownMenu.Item
              onSelect={onUnpin}
              className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none text-danger data-[highlighted]:bg-danger-soft"
            >
              <PinOff size={14} /> Unpin
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </Reorder.Item>
  );
}

/* --------------------------------------------------------------------- */
/* Manage-pins sheet                                                      */
/* --------------------------------------------------------------------- */

function ManagePinsSheet({
  open,
  onOpenChange,
  pins,
  setPins,
  toggle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pins: string[];
  setPins: (next: string[]) => void;
  toggle: (id: string) => void;
}) {
  const unpinned = useMemo(
    () => NAV_ROUTES.filter((r) => !pins.includes(r.id)),
    [pins]
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[min(92vw,520px)] vibrancy-strong rounded-2xl shadow-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold">Manage pinned navigation</Dialog.Title>
            <Dialog.Description className="sr-only">
              Pin, unpin, and reorder destinations in the floating bar.
            </Dialog.Description>
          </div>
          <div className="p-3 max-h-[70vh] overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle px-2 pb-1.5">
              Pinned · drag to reorder
            </div>
            <Reorder.Group axis="y" values={pins} onReorder={setPins} className="space-y-0.5">
              {pins.map((id) => {
                const r = ROUTE_BY_ID[id];
                if (!r) return null;
                const Icon = r.icon;
                return (
                  <Reorder.Item
                    key={id}
                    value={id}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-muted cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical size={14} className="text-fg-subtle" />
                    <Icon size={14} />
                    <span className="text-sm flex-1">{r.label}</span>
                    <button
                      onClick={() => toggle(id)}
                      className="text-xs text-fg-muted hover:text-danger flex items-center gap-1"
                    >
                      <PinOff size={12} /> Unpin
                    </button>
                  </Reorder.Item>
                );
              })}
              {pins.length === 0 && (
                <div className="px-2 py-3 text-xs text-fg-subtle">Nothing pinned yet.</div>
              )}
            </Reorder.Group>

            {unpinned.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-fg-subtle px-2 pt-4 pb-1.5">
                  Available
                </div>
                <div className="space-y-0.5">
                  {unpinned.map((r) => {
                    const Icon = r.icon;
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggle(r.id)}
                        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-muted text-left"
                      >
                        <Icon size={14} className="text-fg-muted" />
                        <span className="text-sm flex-1">{r.label}</span>
                        <span className="text-xs text-fg-subtle flex items-center gap-1">
                          <Pin size={12} /> Pin
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className="px-5 py-3 border-t border-border flex justify-end">
            <button
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-sm rounded-md bg-bg-muted hover:bg-bg-subtle"
            >
              Done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* --------------------------------------------------------------------- */
/* Main floating pill                                                     */
/* --------------------------------------------------------------------- */

const RESERVED_PX = 260; // brand + 2 dividers + ⋯ + search + theme
const PILL_MAX_PX = 1100;
const PILL_VIEWPORT_RATIO = 0.96;
const APPROX_CHIP_PX = 110; // conservative average label-chip width

export function TopPill() {
  const pathname = usePathname() || "/";
  const { pins, setPins, unpin, toggle, move } = usePins();
  const { open: openPalette } = useCommandPalette();
  const [manageOpen, setManageOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pins.length);

  // Mobile detection — guarded for SSR
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Active route (for mobile label)
  const activeRoute = useMemo(
    () => NAV_ROUTES.find((r) => isActive(pathname, r.href)) ?? NAV_ROUTES[0],
    [pathname]
  );

  /* ------------------------------------------------------------------
   * Overflow: derive from viewport width (stable — no observer loop).
   * Allocate available_px = min(viewport * 0.96, 1100) - RESERVED_PX
   * Count = floor(available_px / approx_chip_px), capped at pins.length.
   * This may be slightly conservative; the manage menu always covers
   * any chips that don't fit.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (isMobile) {
      setVisibleCount(0);
      return;
    }
    const compute = () => {
      const vw = window.innerWidth;
      const pillWidth = Math.min(vw * PILL_VIEWPORT_RATIO, PILL_MAX_PX);
      const available = Math.max(0, pillWidth - RESERVED_PX);
      const fit = Math.max(0, Math.floor(available / APPROX_CHIP_PX));
      setVisibleCount(Math.min(fit, pins.length));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [isMobile, pins.length]);

  const visiblePins = isMobile ? [] : pins.slice(0, visibleCount);
  const overflowPins = isMobile ? pins : pins.slice(visibleCount);

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center px-3 pt-3 pointer-events-none">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="pointer-events-auto vibrancy-strong rounded-full shadow-pill flex items-center gap-1 px-1.5 h-11 max-w-[min(96vw,1100px)] w-full sm:w-auto"
        >
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-1.5 pl-2 pr-2.5 h-8 rounded-full hover:bg-bg-muted/60 transition-colors shrink-0"
          >
            <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center">
              <Sparkles size={11} className="text-accent-fg" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight hidden sm:inline">COS</span>
          </Link>

          <span className="w-px h-5 bg-border mx-0.5 shrink-0" aria-hidden />

          {/* Pinned chips (desktop) */}
          {!isMobile && (
            <Reorder.Group
              axis="x"
              values={pins}
              onReorder={setPins}
              className="flex items-center gap-1 min-w-0"
              as="div"
            >
              <AnimatePresence initial={false}>
                {visiblePins.map((id, idx) => {
                  const r = ROUTE_BY_ID[id];
                  if (!r) return null;
                  return (
                    <PillChip
                      key={id}
                      route={r}
                      active={isActive(pathname, r.href)}
                      onUnpin={() => unpin(id)}
                      onMoveLeft={() => move(id, -1)}
                      onMoveRight={() => move(id, 1)}
                      canMoveLeft={idx > 0}
                      canMoveRight={idx < visiblePins.length - 1}
                    />
                  );
                })}
              </AnimatePresence>
            </Reorder.Group>
          )}

          {/* Mobile: active-route label */}
          {isMobile && (
            <div className="flex-1 min-w-0 px-2">
              <div className="text-[13px] font-medium truncate">{activeRoute.label}</div>
            </div>
          )}

          {/* Overflow + manage menu */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className={cn(
                  "shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors",
                  overflowPins.length > 0 && "text-fg"
                )}
                aria-label="More navigation"
              >
                <MoreHorizontal size={15} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={10}
                align="end"
                className="z-[60] min-w-[200px] vibrancy-strong rounded-xl p-1 shadow-lg text-sm"
              >
                {overflowPins.length > 0 && (
                  <>
                    <DropdownMenu.Label className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-subtle">
                      More pinned
                    </DropdownMenu.Label>
                    {overflowPins.map((id) => {
                      const r = ROUTE_BY_ID[id];
                      if (!r) return null;
                      const Icon = r.icon;
                      return (
                        <DropdownMenu.Item key={id} asChild>
                          <Link
                            href={r.href}
                            className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted"
                          >
                            <Icon size={14} />
                            <span>{r.label}</span>
                          </Link>
                        </DropdownMenu.Item>
                      );
                    })}
                    <DropdownMenu.Separator className="h-px bg-border my-1" />
                  </>
                )}
                <DropdownMenu.Item
                  onSelect={() => setManageOpen(true)}
                  className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted"
                >
                  <Pin size={14} /> Manage pins…
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <span className="w-px h-5 bg-border mx-0.5 shrink-0" aria-hidden />

          {/* Search / palette */}
          <button
            onClick={openPalette}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12px] text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
            aria-label="Open command palette"
          >
            <Search size={13} />
            <span className="hidden md:inline">Search</span>
            <kbd className="hidden sm:inline text-[10px] font-mono bg-bg-muted/80 border border-border px-1.5 py-0.5 rounded-md ml-0.5">
              ⌘K
            </kbd>
          </button>

          {/* Density + Theme toggles */}
          <div className="shrink-0 pl-0.5 flex items-center">
            <DensityToggle />
            <ThemeToggle />
          </div>
        </motion.div>
      </div>

      <ManagePinsSheet
        open={manageOpen}
        onOpenChange={setManageOpen}
        pins={pins}
        setPins={setPins}
        toggle={toggle}
      />
    </>
  );
}
