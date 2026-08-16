"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cloneElement, isValidElement, useEffect, useRef, useState, type RefObject } from "react";
import { motion, useMotionValue, useTransform, useSpring, animate, AnimatePresence, useReducedMotion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Home, LayoutGrid, Search, X, ChevronLeft,
  Plus, MessageCircle, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ROUTES, ROUTE_BY_ID, navGroups, type NavRoute } from "@/lib/nav";
import { useNavVisibility, isHiddenNavHref } from "./nav-visibility";
import { usePins } from "@/lib/use-pins";
import { Settings as SettingsIcon } from "lucide-react";
import { useCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { DensityToggle } from "./density-toggle";
import { FocusToggle } from "./focus-mode";
import { NotificationBell } from "./notification-bell";
import { useRegisteredActions } from "./context-actions";

/* --------------------------------------------------------------------- */

/** A primary nav tab — icon only, filled-accent pill when active. The active tab
 *  grows to show its label inline (iOS-tab-bar style), so the current location is
 *  always named without crowding the bar. Touch targets are ≥44px on mobile. */
type NavTipData = { label: string; cx: number };
type TipFn = (t: NavTipData | null) => void;

function NavTab({
  href, icon: Icon, label, active, reduce, onTip, badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  reduce: boolean;
  onTip?: TipFn;
  /** Small red count bubble (e.g. overdue tasks on Home). 0 hides it. */
  badge?: number;
}) {
  const show = (el: HTMLElement) => { const r = el.getBoundingClientRect(); onTip?.({ label, cx: r.left + r.width / 2 }); };
  return (
    <Link
      href={href}
      aria-label={label}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => onTip?.(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => onTip?.(null)}
      onClick={() => onTip?.(null)}
      className={cn(
        "group relative inline-flex items-center justify-center gap-1.5 h-11 md:h-12 rounded-full shrink-0 transition-colors",
        active ? "text-accent px-3 md:px-3.5" : "text-fg-muted hover:text-accent hover:bg-accent-soft/60 w-11 md:w-12"
      )}
    >
      {active && (
        reduce ? (
          <span className="absolute inset-0 rounded-full bg-accent-soft" />
        ) : (
          <motion.span
            layoutId="navpill"
            className="absolute inset-0 rounded-full bg-accent-soft"
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
          />
        )
      )}
      <Icon size={18} strokeWidth={active ? 2.4 : 2} className="relative shrink-0 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-safe:group-hover:scale-125" />
      {active && <span className="relative text-[13px] font-medium whitespace-nowrap">{label}</span>}
      {badge != null && badge > 0 && (
        <span className="absolute right-1 top-1 z-10 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold tabular text-white ring-2 ring-bg">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

/** Frosted floating name-label above a hovered nav icon (replaces the OS tooltip).
 *  Absolutely positioned inside the pill (not clipped) + zoom-corrected. */
function NavTip({ tip, containerRef }: { tip: NavTipData | null; containerRef: React.RefObject<HTMLDivElement | null> }) {
  if (!tip) return null;
  const el = containerRef.current;
  let left = tip.cx;
  if (el) {
    const cr = el.getBoundingClientRect();
    const zoom = el.offsetWidth ? cr.width / el.offsetWidth : 1;
    left = (tip.cx - cr.left) / (zoom || 1);
  }
  return (
    <div
      style={{ position: "absolute", left, bottom: "calc(100% + 10px)", transform: "translateX(-50%)" }}
      className="pointer-events-none z-[60] whitespace-nowrap rounded-lg glass px-2.5 py-1 text-[11px] font-semibold text-fg shadow-pill"
    >
      {tip.label}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* HRMS launcher — the single "everywhere else" menu. Click or hover opens  */
/* a centred dashboard of destinations; pick one to go. Replaces the old    */
/* HRMS/Workbook popovers and the "More" sheet, so the pill stays minimal.  */
/* --------------------------------------------------------------------- */

// The launcher grid is derived from the one shared NAV_ROUTES list (lib/nav.ts),
// so the "Go to" menu, the ⌘K page-jump and the Settings pin list can never
// drift apart.
const DESTINATIONS: Array<{ href: string; label: string; icon: LucideIcon }> =
  NAV_ROUTES.map((r) => ({
    href: r.href,
    label: r.label,
    icon: r.icon,
  }));

/** A compact chip row (Pinned / Recent) above the grouped list. */
function QuickRow({ label, routes, onGo }: { label: string; routes: NavRoute[]; onGo: (href: string) => void }) {
  return (
    <div>
      <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {routes.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onGo(r.href)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev/60 px-2.5 py-1.5 text-[11px] font-medium text-fg transition-all hover:border-accent/30 hover:bg-accent-soft active:scale-[0.97]"
            >
              <Icon size={13} className="text-accent" />
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HrmsLauncher({ active, reduce }: { active: boolean; reduce: boolean }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  // When a world tile is tapped we drill into its page list in-place (mobile path:
  // pill → world → page, two taps), instead of navigating to the /world screen.
  const [drill, setDrill] = useState<string | null>(null);
  const { pins } = usePins();
  const navVisibility = useNavVisibility();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function go(href: string) { setOpen(false); router.push(href); }
  function onMouseEnter() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), 160);
  }
  function onMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }

  // Load recents when the sheet opens, so your last places are one tap.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/prefs/nav-recents", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { recents: [] }))
      .then((d) => { if (!cancelled && Array.isArray(d.recents)) setRecents(d.recents as string[]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // Hidden routes (e.g. Tax & Legal when paused) drop out of every launcher list.
  const shown = (r: NavRoute | undefined): r is NavRoute => !!r && !isHiddenNavHref(r.href, navVisibility);
  const pinRoutes = pins.map((id) => ROUTE_BY_ID[id]).filter(shown);
  const pinnedIds = new Set(pins);
  const recentRoutes = recents
    .map((id) => ROUTE_BY_ID[id])
    .filter((r) => shown(r) && !pinnedIds.has(r.id))
    .slice(0, 5);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Go to"
          title="Go to"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className={cn(
            "relative inline-flex items-center justify-center gap-1.5 h-11 md:h-12 rounded-full shrink-0 transition-colors outline-none",
            active || open ? "text-accent px-3 md:px-3.5" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60 w-11 md:w-12"
          )}
        >
          {(active || open) && (
            reduce ? (
              <span className="absolute inset-0 rounded-full bg-accent-soft" />
            ) : (
              <motion.span layoutId="navpill" className="absolute inset-0 rounded-full bg-accent-soft" transition={{ type: "spring", stiffness: 500, damping: 36 }} />
            )
          )}
          <LayoutGrid size={18} strokeWidth={active ? 2.4 : 2} className="relative shrink-0" />
          {(active || open) && (
            <span className="relative text-[13px] font-medium whitespace-nowrap">Go to</span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm
          data-[state=open]:animate-in data-[state=open]:fade-in-0
          data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[min(420px,calc(100vw-2rem))]
          -translate-x-1/2 -translate-y-1/2 glass glass-menu elevated rounded-3xl p-4 shadow-pill outline-none
          data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0
          data-[state=closed]:animate-out data-[state=closed]:zoom-out-95">
          <div className="flex items-center gap-1.5 mb-3 px-1">
            <Dialog.Title className="text-sm font-semibold">Go to</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors">
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          {(pinRoutes.length > 0 || recentRoutes.length > 0) && (
            <div className="mb-3 space-y-2.5">
              {pinRoutes.length > 0 && <QuickRow label="Pinned" routes={pinRoutes} onGo={go} />}
              {recentRoutes.length > 0 && <QuickRow label="Recent" routes={recentRoutes} onGo={go} />}
            </div>
          )}

          {/* The SAME groups the desktop sidebar shows (lib/nav.ts). This used to
              be a grid of seven colour-coded "Worlds" that you tapped to drill
              into — a second map of the product that never matched the sidebar's,
              which is how Chat and the Director Brief ended up missing from one of
              them. One map now, and one tap instead of two. */}
          <div className="space-y-3">
            {navGroups().map((g) => {
              const items = g.items.filter((r) => !isHiddenNavHref(r.href, navVisibility));
              if (items.length === 0) return null;
              return (
                <div key={g.label}>
                  <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-fg-muted">{g.label}</div>
                  <div className="space-y-0.5">
                    {items.map((r) => {
                      const Icon = r.icon;
                      const base = r.href.split("?")[0];
                      const isActive = base !== "/" && (pathname === base || pathname.startsWith(base + "/"));
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => go(r.href)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 h-11 rounded-xl text-sm text-left transition-colors active:scale-[0.98]",
                            isActive ? "bg-accent-soft text-accent" : "text-fg hover:bg-bg-muted/60"
                          )}
                        >
                          <Icon size={17} className={cn("shrink-0", !isActive && "text-fg-muted")} />
                          <span className="truncate font-medium">{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Preferences — appearance + comfort controls, consolidated here so
              the nav pill stays minimal (especially on mobile). */}
          <div className="mt-3 flex items-center gap-1 rounded-2xl border border-border bg-bg-elev/60 px-2 py-1.5">
            <span className="px-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-muted">Preferences</span>
            <div className="ml-auto flex items-center gap-0.5">
              <ThemeToggle />
              <DensityToggle />
              <FocusToggle withLabel />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* --------------------------------------------------------------------- */
/* Page action — the current page's primary contextual action, surfaced as */
/* a single icon in the nav pill. Mirrors the action's own icon; fires it   */
/* directly when there's one, opens a small popover when there are several. */
/* --------------------------------------------------------------------- */

// Unified system-wide "add" glyph in the nav pill — every page's primary action
// surfaces as the same "+", regardless of the action's own icon. The label/title
// still describes the specific action for accessibility; per-action icons remain
// in the multi-action dropdown list.
function navIcon() {
  return <Plus size={19} />;
}

function NavActionButton() {
  const { actions, suppressed } = useRegisteredActions();
  const [open, setOpen] = useState(false);
  // Actions register via client effects, so the server renders none. The
  // wrapper is ALWAYS present (never unmounts) and collapses its width to 0
  // when there's no action — so it animates smoothly and can't "disappear".
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const show = mounted && actions.length > 0 && !suppressed;
  const primary = show ? (actions.find((a) => a.primary) ?? actions[0]) : null;
  const multi = show && actions.length > 1;
  const btn = "shrink-0 inline-flex items-center justify-center h-11 w-11 md:h-12 md:w-12 rounded-full text-fg hover:bg-bg-muted/60 transition-colors";

  return (
    <motion.div
      initial={false}
      animate={{ width: show ? "auto" : 0, opacity: show ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.8 }}
      className={cn("flex items-center shrink-0", open ? "overflow-visible" : "overflow-hidden")}
    >
      {primary && !multi && (
        primary.href ? (
          <Link href={primary.href} aria-label={primary.label} title={primary.label} className={btn}>{navIcon()}</Link>
        ) : (
          <button type="button" onClick={primary.onClick} aria-label={primary.label} title={primary.label} className={btn}>{navIcon()}</button>
        )
      )}
      {primary && multi && (
        <div className="relative shrink-0">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Page actions" title={primary.label} className={btn}>{navIcon()}</button>
          {open && (
            <>
              <button type="button" aria-label="Close" className="fixed inset-0 z-[55] cursor-default" onClick={() => setOpen(false)} />
              <div className="absolute z-[56] bottom-full mb-3 right-0 w-56 max-w-[calc(100vw-2rem)] glass glass-menu elevated rounded-2xl p-1.5 shadow-lg">
                <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-muted">Actions</div>
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
      )}
    </motion.div>
  );
}

/* --------------------------------------------------------------------- */
/* Liquid lens — a draggable glass capsule over the nav slots. Drag it     */
/* across the tabs (Home → Search) and release to select. Only deliberate  */
/* horizontal drags are claimed, so taps / long-press / popovers still     */
/* work untouched.                                                         */
/* --------------------------------------------------------------------- */

const LENS_SLOTS = ["Home", "Chat", "Search"] as const;

function NavLens({ containerRef, onSelect, enabled = true }: { containerRef: RefObject<HTMLDivElement | null>; onSelect: (label: string) => void; enabled?: boolean }) {
  const x = useMotionValue(0);
  const scaleX = useMotionValue(1);
  const scaleY = useMotionValue(1);
  // Velocity-driven specular glare + chromatic-aberration border (springy, eases
  // back to neutral at rest).
  const rawShift = useMotionValue(0);
  const shift = useSpring(rawShift, { stiffness: 300, damping: 22, mass: 0.4 });
  const glareX = useTransform(shift, (v) => -v * 1.4);
  const edgeC = useTransform(shift, (v) => v * 1.1);   // cyan edge
  const edgeR = useTransform(shift, (v) => -v * 1.1);  // rose edge
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState({ w: 44, h: 40, top: 0 });
  // Reduce Motion / Reduce Transparency → a plain solid highlight, no optics.
  const [plain, setPlain] = useState(false);
  const plainRef = useRef(false);
  const SPRING = { type: "spring" as const, stiffness: 340, damping: 32, mass: 0.95 };

  useEffect(() => {
    const mm = window.matchMedia("(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce)");
    const u = () => { setPlain(mm.matches); plainRef.current = mm.matches; };
    u(); mm.addEventListener("change", u);
    return () => mm.removeEventListener("change", u);
  }, []);

  useEffect(() => {
    const c = containerRef.current;
    if (!c || !enabled) return;

    type Slot = { label: string; center: number; w: number; h: number; top: number };
    const s = { dragging: false, startX: 0, lastX: 0, lastT: 0, pid: -1, left: 0, slots: [] as Slot[] };

    const readSlots = (): Slot[] => {
      const cr = c.getBoundingClientRect();
      s.left = cr.left; // cache: the pill is fixed, so no per-move layout reads
      return LENS_SLOTS.map((label) => {
        const el = c.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { label, center: r.left - cr.left + r.width / 2, w: r.width, h: r.height, top: r.top - cr.top };
      }).filter(Boolean) as Slot[];
    };

    const place = (centerX: number, vx = 0) => {
      x.set(centerX);
      if (plainRef.current) { scaleX.set(1); scaleY.set(1); rawShift.set(0); return; }
      const stretch = Math.min(0.34, Math.abs(vx) * 0.016);
      scaleX.set(1 + stretch);
      scaleY.set(1 - stretch * 0.5);
      rawShift.set(Math.max(-6, Math.min(6, vx * 0.5))); // chromatic + glare offset
    };

    const clampPx = (raw: number) => Math.max(s.slots[0].center, Math.min(s.slots[s.slots.length - 1].center, raw));

    const onDown = (e: PointerEvent) => {
      s.slots = readSlots();
      s.startX = e.clientX; s.lastX = e.clientX; s.lastT = performance.now(); s.dragging = false; s.pid = e.pointerId;
    };

    const onMove = (e: PointerEvent) => {
      if (!s.slots.length || e.pointerId !== s.pid) return;
      const dx = e.clientX - s.startX;
      if (!s.dragging) {
        if (Math.abs(dx) < 8) return;
        s.dragging = true;
        try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        const first = s.slots[0];
        setBox({ w: first.w + 8, h: first.h + 2, top: first.top - 1 });
        x.set(clampPx(e.clientX - s.left));
        setVisible(true);
      }
      e.preventDefault();
      const now = performance.now();
      const vx = (e.clientX - s.lastX) / Math.max(1, now - s.lastT);
      s.lastX = e.clientX; s.lastT = now;
      place(clampPx(e.clientX - s.left), vx);
    };

    const onUp = (e: PointerEvent) => {
      if (s.dragging) {
        const px = e.clientX - s.left;
        const nearest = s.slots.reduce((a, b) => (Math.abs(b.center - px) < Math.abs(a.center - px) ? b : a), s.slots[0]);
        if (plainRef.current) {
          x.set(nearest.center); scaleX.set(1); scaleY.set(1);
        } else {
          animate(x, nearest.center, SPRING);
          animate(scaleX, 1, SPRING);
          animate(scaleY, 1, SPRING);
        }
        rawShift.set(0);
        onSelect(nearest.label);
        window.setTimeout(() => setVisible(false), 320);
      }
      if (s.pid >= 0) { try { c.releasePointerCapture(s.pid); } catch { /* ignore */ } }
      s.dragging = false; s.pid = -1;
    };

    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove, { passive: false });
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onUp);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onUp);
    };
    // rawShift is a stable motion value; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, x, scaleX, scaleY, enabled]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          style={{ x, scaleX, scaleY, left: -box.w / 2, top: box.top, width: box.w, height: box.h, originX: 0.5, originY: 0.5, willChange: "transform" }}
          className={cn(
            "pointer-events-none absolute z-20 overflow-hidden rounded-lg",
            plain
              ? "bg-accent-soft ring-1 ring-accent/30"
              : "glass-refract bg-white/20 dark:bg-white/[0.07] ring-1 ring-white/55 dark:ring-white/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65),inset_0_-1px_0_0_rgba(255,255,255,0.15),0_5px_16px_-6px_rgba(0,0,0,0.35)] backdrop-blur-[3px] backdrop-saturate-[1.7]"
          )}
        >
          {!plain && (
            <>
              <motion.span style={{ x: edgeC }} className="pointer-events-none absolute inset-0 rounded-lg border-2 border-cyan-300/45 mix-blend-screen" />
              <motion.span style={{ x: edgeR }} className="pointer-events-none absolute inset-0 rounded-lg border-2 border-rose-400/45 mix-blend-screen" />
              <motion.span style={{ x: glareX }} className="pointer-events-none absolute left-1/2 -top-1 h-3 w-9 -translate-x-1/2 rounded-full bg-white/50 blur-[3px]" />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
/* The vertical SidePill and its seven World flyouts lived here. Both are gone:
   the persistent DeskSidebar owns the left edge from lg up (the pill was already
   wrapped in `hidden`, so it rendered nothing), and Worlds was retired in favour
   of the one grouping in lib/nav.ts. See NAV_GROUPS there. */


/* --------------------------------------------------------------------- */
/* The bottom-floating pill                                               */
/* --------------------------------------------------------------------- */

export function TopPill({ overdue = 0 }: { overdue?: number }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { open: openPalette } = useCommandPalette();
  const pillRef = useRef<HTMLDivElement>(null);

  // Honour reduced-motion — OS (also covered by MotionConfig) AND the portal's
  // manual data-motion toggle (framer ignores that CSS attribute, so check it).
  const prefersReduced = useReducedMotion();
  const [manualReduced, setManualReduced] = useState(false);
  useEffect(() => { setManualReduced(document.documentElement.getAttribute("data-motion") === "reduced"); }, [pathname]);
  const reduce = !!prefersReduced || manualReduced;

  // The drag-lens is a tablet+ flourish (see NavLens usage below).
  const [wide, setWide] = useState(false);
  const [tip, setTip] = useState<NavTipData | null>(null);
  useEffect(() => {
    const mm = window.matchMedia("(min-width: 768px)");
    const u = () => setWide(mm.matches);
    u(); mm.addEventListener("change", u);
    return () => mm.removeEventListener("change", u);
  }, []);

  function selectSlot(label: string) {
    if (label === "Home") router.push("/");
    else if (label === "Chat") router.push("/chat");
    else if (label === "Search") openPalette();
  }

  const onHub = pathname === "/";
  const homeActive = onHub;
  const chatActive = pathname.startsWith("/chat");
  // The Go-to icon lights for any launcher destination, not just /hrms/* — so its
  // non-/hrms pages (People, Documents, Companies, Calendar, Outbox, Insights,
  // Settings) show an active nav item too.
  const hrmsActive =
    pathname.startsWith("/hrms") ||
    DESTINATIONS.some((d) => pathname === d.href || pathname.startsWith(d.href + "/"));

  return (
    <>
    {/* On mobile, chat is a full-screen app of its own — the pill steps aside.
        From lg up the DeskSidebar takes over, so the bottom pill hides. */}
    <div className={cn(
      "fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-5 z-40 justify-center px-2 pointer-events-none lg:hidden",
      chatActive ? "hidden md:flex" : "flex"
    )}>
      <motion.div
        ref={pillRef}
        data-nav-pill
        initial={reduce ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
        style={{ touchAction: "pan-y" }}
        className="relative pointer-events-auto max-w-[calc(100vw-1.5rem)] nav-frost glass elevated rounded-full shadow-pill flex items-center gap-0 md:gap-1 px-1 md:px-2.5 h-[3.25rem] md:h-[4.25rem] md:[&_svg]:w-[22px] md:[&_svg]:h-[22px]"
      >
        <NavTip tip={tip} containerRef={pillRef} />
        {/* The drag-lens is a tablet+ flourish — on phones it competes with taps
            and is undiscoverable, so it's disabled there (plain taps still work). */}
        <NavLens containerRef={pillRef} onSelect={selectSlot} enabled={wide} />
        <NavTab href="/" icon={Home} label="Home" active={homeActive} reduce={reduce} onTip={setTip} badge={overdue} />
        <HrmsLauncher active={hrmsActive} reduce={reduce} />
        <NavTab href="/chat" icon={MessageCircle} label="Chat" active={chatActive} reduce={reduce} onTip={setTip} />

        <span className="nav-divider w-px h-6 md:h-7 mx-0.5 md:mx-1 shrink-0" aria-hidden />

        <button
          onClick={openPalette}
          className="shrink-0 inline-flex items-center justify-center h-11 w-11 md:h-12 md:w-12 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
          aria-label="Search"
          title="Search (⌘K)"
        >
          <Search size={18} />
        </button>

        {/* Notification bell lives IN the pill below xl, so the bell isn't a lonely
            corner button on phones. At xl+ the vertical SidePill takes over and the
            bell returns to the top-right (see below). */}
        <div className="shrink-0 inline-flex items-center justify-center h-11 w-11 md:h-12 md:w-12">
          <NotificationBell to="/task" align="right" lanes />
        </div>

        {/* The page-action + sits at the end, next to the theme toggle. */}
        <NavActionButton />

        {/* Theme toggle on the bar (desktop only — the dense mobile bar keeps it in the menu). */}
        <div className="hidden md:flex shrink-0 items-center">
          <ThemeToggle />
        </div>
      </motion.div>
    </div>
    {/* At lg+ the bottom pill is gone (vertical SidePill instead), so the bell
        sits top-right. Below lg it lives in the pill above, so hide it here. */}
    {!chatActive && (
      <div className="hidden lg:block fixed top-[calc(0.5rem+env(safe-area-inset-top))] right-3 md:right-5 z-40 glass elevated rounded-full p-1 shadow-pill">
        <NotificationBell to="/task" align="right" lanes />
      </div>
    )}
    {/* When chat hides the pill on mobile, keep a way home. */}
    {chatActive && (
      <Link
        href="/"
        aria-label="Home"
        title="Home"
        className="md:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] right-3 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full glass elevated shadow-pill text-fg-muted transition-transform active:scale-95"
      >
        <Home size={20} />
      </Link>
    )}
    </>
  );
}
