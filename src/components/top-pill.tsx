"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { cloneElement, isValidElement, useEffect, useRef, useState, type RefObject } from "react";
import { motion, useMotionValue, useTransform, useSpring, animate, AnimatePresence } from "framer-motion";
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
          "relative inline-flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full transition-colors select-none touch-none",
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

const LENS_SLOTS = ["Home", "Task Management", "Companies", "Workbook", "Search"] as const;
const LENS_ICON: Record<string, LucideIcon> = {
  Home, "Task Management": CheckSquare, Companies: Building2, Workbook: NotebookPen, Search,
};

function NavLens({ containerRef, onSelect }: { containerRef: RefObject<HTMLDivElement | null>; onSelect: (label: string) => void }) {
  const x = useMotionValue(0);
  const scaleX = useMotionValue(1);
  const scaleY = useMotionValue(1);
  // Velocity-driven specular glare (springy so it eases back at rest).
  const rawShift = useMotionValue(0);
  const shift = useSpring(rawShift, { stiffness: 300, damping: 22, mass: 0.4 });
  const glareX = useTransform(shift, (v) => -v * 1.4);
  const [visible, setVisible] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string>("Home");
  const [box, setBox] = useState({ w: 44, h: 40, top: 0 });
  // Measured slot centres for the in-lens clone of the real icons.
  const [slots, setSlots] = useState<{ label: string; center: number }[]>([]);
  // Shift the clone so the slice under the lens overlays the real nav exactly.
  const cloneShift = useTransform(x, (v) => box.w / 2 - v);
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
        setBox({ w: first.w + 6, h: first.h, top: first.top });
        setSlots(s.slots.map((sl) => ({ label: sl.label, center: sl.center })));
        x.set(clampPx(e.clientX - s.left));
        setVisible(true);
      }
      e.preventDefault();
      const now = performance.now();
      const vx = (e.clientX - s.lastX) / Math.max(1, now - s.lastT);
      s.lastX = e.clientX; s.lastT = now;
      const px = clampPx(e.clientX - s.left);
      place(px, vx);
      const near = s.slots.reduce((a, b) => (Math.abs(b.center - px) < Math.abs(a.center - px) ? b : a), s.slots[0]);
      setActiveLabel(near.label);
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
            "pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden rounded-[1.1rem]",
            plain
              ? "bg-accent-soft ring-1 ring-accent/30"
              // Frosted, near-opaque fill MASKS the real icons beneath (no doubling);
              // the refracted clone on top is the single visible copy.
              : "bg-[hsl(0_0%_100%/0.62)] dark:bg-[hsl(240_8%_15%/0.9)] ring-1 ring-white/45 dark:ring-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55),0_6px_18px_-6px_rgba(0,0,0,0.45)] backdrop-blur-[6px] backdrop-saturate-[1.4]"
          )}
        >
          {!plain && (
            <>
              {/* Refracted clone of the REAL icons beneath — magnified, edge-bent
                  and chromatically aberrated via an SVG element filter (Safari-safe).
                  No injected icon: the active tab shows accent because it's the
                  real content. */}
              <motion.div style={{ x: cloneShift, scale: 1.14 }} className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0" style={{ filter: "url(#cos-lens-refract)" }}>
                  {slots.map((sl) => {
                    const Icon = LENS_ICON[sl.label] ?? Home;
                    return (
                      <span
                        key={sl.label}
                        style={{ left: sl.center, top: "50%", transform: "translate(-50%,-50%)" }}
                        className={cn("absolute", sl.label === activeLabel ? "text-accent" : "text-fg-muted")}
                      >
                        <Icon size={20} strokeWidth={2.2} />
                      </span>
                    );
                  })}
                </div>
              </motion.div>

              {/* Specular glare — a soft highlight that lags the motion. */}
              <motion.span style={{ x: glareX }} className="pointer-events-none absolute left-1/2 -top-1 h-3 w-9 -translate-x-1/2 rounded-full bg-white/40 blur-[3px]" />
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

export function TopPill({ companies = [] }: { companies?: Company[] }) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab");
  const { open: openPalette } = useCommandPalette();
  const pillRef = useRef<HTMLDivElement>(null);

  function selectSlot(label: string) {
    if (label === "Home") router.push("/");
    else if (label === "Task Management") router.push("/?tab=tasks");
    else if (label === "Companies") router.push("/companies");
    else if (label === "Workbook") router.push("/workbook");
    else if (label === "Search") openPalette();
  }

  const onHub = pathname === "/";
  const homeActive = onHub && tab !== "tasks";
  const tasksActive = onHub && tab === "tasks";
  const companiesActive = pathname.startsWith("/companies");
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
        <CompaniesNavTab companies={companies} active={companiesActive} />
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
