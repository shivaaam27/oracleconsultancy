"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

/* --------------------------------------------------------------------- */
/* Types                                                                  */
/* --------------------------------------------------------------------- */

export type ContextAction = {
  /** Stable id within its source — used for React keys. */
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Link target. Mutually exclusive with onClick. */
  href?: string;
  onClick?: () => void;
  tone?: "accent" | "default" | "danger";
  /** Exactly one action per page should be primary (the filled one). */
  primary?: boolean;
  /** Hide the text label on mobile (icon-only) to save width. */
  compact?: boolean;
};

/* --------------------------------------------------------------------- */
/* Provider — pages register their actions here; the bar consumes them.   */
/* --------------------------------------------------------------------- */

type Ctx = {
  register: (sourceId: string, actions: ContextAction[]) => void;
  unregister: (sourceId: string) => void;
  actions: ContextAction[];
  suppressed: boolean;
  pushSuppress: () => void;
  popSuppress: () => void;
};

const ActionsContext = createContext<Ctx | null>(null);

export function ContextActionsProvider({ children }: { children: React.ReactNode }) {
  const [sources, setSources] = useState<Record<string, ContextAction[]>>({});
  // Count of open overlays asking to hide the bar (robust to several at once).
  const [suppressCount, setSuppressCount] = useState(0);

  const register = useCallback((sourceId: string, actions: ContextAction[]) => {
    setSources((s) => ({ ...s, [sourceId]: actions }));
  }, []);
  const unregister = useCallback((sourceId: string) => {
    setSources((s) => {
      if (!(sourceId in s)) return s;
      const next = { ...s };
      delete next[sourceId];
      return next;
    });
  }, []);
  const pushSuppress = useCallback(() => setSuppressCount((c) => c + 1), []);
  const popSuppress = useCallback(() => setSuppressCount((c) => Math.max(0, c - 1)), []);

  const actions = Object.values(sources).flat();

  return (
    <ActionsContext.Provider value={{ register, unregister, actions, suppressed: suppressCount > 0, pushSuppress, popSuppress }}>
      {children}
    </ActionsContext.Provider>
  );
}

/** Read the currently-registered actions + suppression state (for the AI-pill extrusion). */
export function useRegisteredActions() {
  const ctx = useContext(ActionsContext);
  return { actions: ctx?.actions ?? [], suppressed: ctx?.suppressed ?? false };
}

/**
 * Hide the context action bar while `active` — used by overlays/modals so a
 * page's "New Task" (etc.) button doesn't sit behind the very surface it opened.
 */
export function useContextBarSuppressed(active: boolean) {
  const ctx = useContext(ActionsContext);
  useEffect(() => {
    if (!active || !ctx) return;
    ctx.pushSuppress();
    return () => ctx.popSuppress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/**
 * Register this page/component's contextual actions. Pass a stable `sourceId`
 * and re-run when `deps` change. Cleans itself up on unmount.
 */
export function useContextActions(sourceId: string, actions: ContextAction[], deps: React.DependencyList) {
  const ctx = useContext(ActionsContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ctx) return;
    ctx.register(sourceId, actions);
    return () => ctx.unregister(sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* --------------------------------------------------------------------- */
/* The bar — sticky top row on desktop, floating pill on mobile.          */
/* --------------------------------------------------------------------- */

export function ContextActionBar() {
  const ctx = useContext(ActionsContext);
  const actions = ctx?.actions ?? [];
  const suppressed = ctx?.suppressed ?? false;
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);

  // Scroll-aware (mobile): collapse on scroll-down, reveal on scroll-up.
  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY.current + 6 && y > 80) setCollapsed(true);
      else if (y < lastY.current - 6) setCollapsed(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (actions.length === 0 || suppressed) return null;

  const primary = actions.find((a) => a.primary) ?? actions[0];
  const secondary = actions.filter((a) => a !== primary);
  const hasSecondary = secondary.length > 0;

  return (
    <>
      {/* ---------- Desktop: a single glass pill, matching the floating nav ---------- */}
      <div className="hidden md:flex sticky top-2 z-30 justify-end mb-1 pointer-events-none">
        <div className="pointer-events-auto glass elevated shadow-pill rounded-full flex items-center gap-1 px-2 py-1.5">
          <ActionControl action={primary} variant="desktop" />
          {secondary.map((a) => (
            <ActionControl key={a.id} action={a} variant="desktop" />
          ))}
        </div>
      </div>

      {/* ---------- Mobile: floating pill above the nav ---------- */}
      <div className="md:hidden fixed inset-x-0 z-40 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] flex justify-center px-3 pointer-events-none">
        <AnimatePresence mode="popLayout" initial={false}>
          {collapsed && hasSecondary ? (
            // Collapsed → single round button that re-expands.
            <motion.button
              key="collapsed"
              type="button"
              onClick={() => setCollapsed(false)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={spring}
              aria-label="Show actions"
              className="pointer-events-auto glass elevated shadow-pill h-11 w-11 rounded-full flex items-center justify-center text-accent"
            >
              {primary.icon ?? <ChevronUp size={20} />}
            </motion.button>
          ) : (
            // Expanded → full action pill.
            <motion.div
              key="expanded"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={spring}
              className="pointer-events-auto glass elevated shadow-pill rounded-full flex items-center gap-1 px-2 py-1.5 max-w-[calc(100vw-1.5rem)]"
            >
              <ActionControl action={primary} variant="mobile" />
              {secondary.map((a) => (
                <ActionControl key={a.id} action={a} variant="mobile" />
              ))}
              {hasSecondary && (
                <>
                  <span className="w-px h-6 bg-border mx-0.5 shrink-0" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    aria-label="Hide actions"
                    className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full text-fg-subtle hover:text-fg hover:bg-bg-muted/60 transition-colors"
                  >
                    <ChevronDown size={16} />
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- */
/* A single action — renders as a Link or a button.                       */
/* --------------------------------------------------------------------- */

export function ActionControl({ action, variant }: { action: ContextAction; variant: "desktop" | "mobile" }) {
  const { label, icon, href, onClick, tone = "default", primary, compact } = action;

  const base = "group/act inline-flex items-center gap-1.5 rounded-full transition-colors active:scale-[0.97] whitespace-nowrap shrink-0";
  const size = "px-3 py-1.5 text-[13px]";
  // Ghost items inside a single glass pill — matches the main floating nav bar.
  // The accent-tinted icon (below) is what marks the primary action.
  const skin = primary
    ? "text-fg font-medium hover:bg-bg-muted/60"
    : "text-fg-muted hover:text-fg hover:bg-bg-muted/60";
  // The icon carries the colour accent (red for destructive, brand otherwise)
  // instead of flooding the whole pill with a fill.
  const iconTone = tone === "danger" ? "text-danger" : primary ? "text-accent" : "text-current";

  const inner = (
    <>
      {icon && <span className={cn("shrink-0", iconTone)}>{icon}</span>}
      {/* On mobile, compact secondary actions show icon only. */}
      <span className={cn(variant === "mobile" && compact && !primary && "sr-only")}>{label}</span>
    </>
  );

  const className = cn(base, size, skin);

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label} title={label}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} aria-label={label} title={label}>
      {inner}
    </button>
  );
}
