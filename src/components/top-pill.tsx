"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { cloneElement, isValidElement, useEffect, useRef, useState, type RefObject } from "react";
import { motion, useMotionValue, useTransform, useSpring, animate, AnimatePresence } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Home, CheckSquare, NotebookPen, LayoutGrid, Search,
  Send, Inbox, BarChart3, Settings, Plus, Package, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { useRegisteredActions, type ContextAction } from "./context-actions";

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
        "relative inline-flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full shrink-0 transition-colors",
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
/* "More" sheet — the secondary destinations                              */
/* --------------------------------------------------------------------- */

const MORE: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/hrms", label: "HRMS", icon: Package },
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
            "relative inline-flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full shrink-0 transition-colors outline-none",
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
  // Actions register via client effects, so the server renders none. The
  // wrapper is ALWAYS present (never unmounts) and collapses its width to 0
  // when there's no action — so it animates smoothly and can't "disappear".
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const show = mounted && actions.length > 0 && !suppressed;
  const primary = show ? (actions.find((a) => a.primary) ?? actions[0]) : null;
  const multi = show && actions.length > 1;
  const btn = "shrink-0 inline-flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full text-accent hover:bg-bg-muted/60 transition-colors";

  return (
    <motion.div
      initial={false}
      animate={{ width: show ? "auto" : 0, opacity: show ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.8 }}
      className={cn("flex items-center shrink-0", open ? "overflow-visible" : "overflow-hidden")}
    >
      {primary && !multi && (
        primary.href ? (
          <Link href={primary.href} aria-label={primary.label} title={primary.label} className={btn}>{navIcon(primary)}</Link>
        ) : (
          <button type="button" onClick={primary.onClick} aria-label={primary.label} title={primary.label} className={btn}>{navIcon(primary)}</button>
        )
      )}
      {primary && multi && (
        <div className="relative shrink-0">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Page actions" title={primary.label} className={btn}>{navIcon(primary)}</button>
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

const LENS_SLOTS = ["Home", "Task Management", "Workbook", "Search"] as const;

function NavLens({ containerRef, onSelect }: { containerRef: RefObject<HTMLDivElement | null>; onSelect: (label: string) => void }) {
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
    if (!c) return;

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
  }, [containerRef, x, scaleX, scaleY]);

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
            "pointer-events-none absolute z-20 overflow-hidden rounded-[1.1rem]",
            plain
              ? "bg-accent-soft ring-1 ring-accent/30"
              // Clear liquid glass: just a light frost + bright rim. It refracts the
              // real icons in place (Chromium backdrop) and frosts them elsewhere —
              // nothing is painted inside, so there's nothing to double up.
              : "glass-refract bg-white/20 dark:bg-white/[0.07] ring-1 ring-white/55 dark:ring-white/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65),inset_0_-1px_0_0_rgba(255,255,255,0.15),0_5px_16px_-6px_rgba(0,0,0,0.35)] backdrop-blur-[3px] backdrop-saturate-[1.7]"
          )}
        >
          {!plain && (
            <>
              {/* Chromatic-aberration border: two coloured rims that separate with
                  velocity (the morph) and re-converge to a clean rim at rest. */}
              <motion.span style={{ x: edgeC }} className="pointer-events-none absolute inset-0 rounded-[1.1rem] border-2 border-cyan-300/45 mix-blend-screen" />
              <motion.span style={{ x: edgeR }} className="pointer-events-none absolute inset-0 rounded-[1.1rem] border-2 border-rose-400/45 mix-blend-screen" />

              {/* Specular glare — a soft highlight that lags the motion. */}
              <motion.span style={{ x: glareX }} className="pointer-events-none absolute left-1/2 -top-1 h-3 w-9 -translate-x-1/2 rounded-full bg-white/50 blur-[3px]" />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* --------------------------------------------------------------------- */
/* The bottom-floating pill (mobile only)                                 */
/* --------------------------------------------------------------------- */

export function TopPill() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab");
  const { open: openPalette } = useCommandPalette();
  const pillRef = useRef<HTMLDivElement>(null);

  function selectSlot(label: string) {
    if (label === "Home") router.push("/");
    else if (label === "Task Management") router.push("/?tab=tasks");
    else if (label === "Workbook") router.push("/workbook");
    else if (label === "Search") openPalette();
  }

  const onHub = pathname === "/";
  const homeActive = onHub && tab !== "tasks";
  const tasksActive = onHub && tab === "tasks";
  const workbookActive = pathname.startsWith("/workbook");

  return (
    <div className="fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-5 z-40 flex justify-center px-2 pointer-events-none">
      <motion.div
        ref={pillRef}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        style={{ touchAction: "pan-y" }}
        className="relative pointer-events-auto glass elevated rounded-full shadow-pill flex items-center gap-0.5 md:gap-1 px-1.5 md:px-2.5 h-14 md:h-[4.25rem] md:[&_svg]:w-[22px] md:[&_svg]:h-[22px]"
      >
        <NavLens containerRef={pillRef} onSelect={selectSlot} />
        <NavTab href="/" icon={Home} label="Home" active={homeActive} />
        <NavTab href="/?tab=tasks" icon={CheckSquare} label="Task Management" active={tasksActive} />
        <NavTab href="/workbook" icon={NotebookPen} label="Workbook" active={workbookActive} />
        <MoreSheet pathname={pathname} />

        <span className="w-px h-6 md:h-7 bg-border mx-0.5 md:mx-1 shrink-0" aria-hidden />

        <NavActionButton />

        <button
          onClick={openPalette}
          className="shrink-0 inline-flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
          aria-label="Search"
          title="Search (⌘K)"
        >
          <Search size={19} />
        </button>

        <div className="shrink-0 flex items-center md:[&_button]:h-11 md:[&_button]:w-11">
          <ThemeToggle />
        </div>
      </motion.div>
    </div>
  );
}
