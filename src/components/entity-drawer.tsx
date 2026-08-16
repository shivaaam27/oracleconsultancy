"use client";

import { type ReactNode, type CSSProperties, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export type DrawerTab = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Small count/dot shown next to the label. */
  badge?: ReactNode;
  content: ReactNode;
  /** Mounted (so summaries report) but NOT shown in the tab pill — reachable by
   *  setting it active programmatically (e.g. from a metric chip or a "More"
   *  menu). Used by the person drawer's deep views. */
  hidden?: boolean;
};

/**
 * Reusable profile-cockpit drawer shell — a status-tinted hero, a glass
 * segmented tab pill, an animated single-view body, and a sticky action bar.
 * Person/company drawers and pop-ups share this so the whole app gets the same
 * fluid feel. Callers provide the hero, tabs and action bar as slots.
 */
export function EntityDrawer({
  open,
  onClose,
  /** Accessible title (visually hidden) — Radix requires one per dialog. */
  title,
  /** Subtle status glow behind the hero: success | warn | danger | accent. */
  tone = "accent",
  hero,
  tabs,
  activeTab,
  onTabChange,
  actionBar,
  loading,
  error,
  errorLabel = "Couldn't load.",
  maxWidth = "560px",
  /** On phones, fill the screen (sheet) instead of a centred card. Desktop
   *  keeps the centred card. Used by the task drawer for its richer content. */
  fullScreenOnMobile = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  tone?: "accent" | "success" | "warn" | "danger";
  hero: ReactNode;
  tabs: DrawerTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  actionBar?: ReactNode;
  loading?: boolean;
  error?: boolean;
  errorLabel?: string;
  maxWidth?: string;
  fullScreenOnMobile?: boolean;
}) {
  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const glow =
    tone === "success" ? "var(--success)" : tone === "warn" ? "var(--warn)" : tone === "danger" ? "var(--danger)" : "var(--accent)";

  const inner = (
    <>
      <Dialog.Title className="sr-only">{title}</Dialog.Title>
      {/* Close button floats over the hero */}
      <Dialog.Close asChild>
        <button
          type="button"
          aria-label="Close"
          className="absolute right-3 top-3 z-10 h-8 w-8 inline-flex items-center justify-center rounded-full bg-bg-elev/70 backdrop-blur text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors"
        >
          <X size={15} />
        </button>
      </Dialog.Close>
      <DrawerBody
        glow={glow}
        hero={hero}
        tabs={tabs}
        current={current}
        onTabChange={onTabChange}
        actionBar={actionBar}
        loading={loading}
        error={error}
        errorLabel={errorLabel}
      />
    </>
  );

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          forceMount
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-200
            data-[state=open]:opacity-100 data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none"
        />
        {fullScreenOnMobile ? (
          <Dialog.Content
            aria-describedby={undefined}
            /* ⚠️ Click-outside has to be handled BY HAND here.
             *
             * This branch makes Content `fixed inset-0` — a full-screen flex box
             * that centres the card. That means the grey area around the card is
             * INSIDE Dialog.Content, so Radix's dismissable layer never sees an
             * "outside" pointerdown and the drawer could not be closed by clicking
             * away from it. (The person and company drawers both use this branch,
             * so both were stuck open until you found the X.)
             *
             * `e.target === e.currentTarget` is true only for the padding area
             * itself, never for a click that lands on the card. */
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            className="group fixed inset-0 z-[51] flex items-end justify-center sm:items-center outline-none
              data-[state=open]:animate-in data-[state=closed]:animate-out
              data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200
              data-[state=closed]:pointer-events-none"
          >
            <div
              style={{ "--drawer-mw": maxWidth } as CSSProperties}
              className="relative flex flex-col overflow-hidden bg-bg ring-1 ring-border shadow-2xl outline-none
                w-full max-h-[92dvh] rounded-t-3xl
                sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100%-1.5rem)] sm:max-w-[var(--drawer-mw)] sm:rounded-3xl
                group-data-[state=open]:animate-in group-data-[state=closed]:animate-out duration-200
                group-data-[state=open]:slide-in-from-bottom-6 group-data-[state=closed]:slide-out-to-bottom-6
                sm:group-data-[state=open]:slide-in-from-bottom-0 sm:group-data-[state=closed]:slide-out-to-bottom-0
                sm:group-data-[state=open]:zoom-in-95 sm:group-data-[state=closed]:zoom-out-95"
            >
              {/* iPhone-style grab handle (mobile sheet only) */}
              <div className="sm:hidden mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
              {inner}
            </div>
          </Dialog.Content>
        ) : (
        <Dialog.Content forceMount aria-describedby={undefined} asChild>
          <motion.div
            style={{ maxWidth, pointerEvents: open ? "auto" : "none" }}
            initial={false}
            animate={{ x: "-50%", y: "-50%", opacity: open ? 1 : 0, scale: open ? 1 : 0.88 }}
            transition={spring}
            className="fixed left-1/2 top-1/2 z-[51] max-h-[90dvh] w-[calc(100%-1.5rem)]
              flex flex-col overflow-hidden bg-bg ring-1 ring-border shadow-2xl rounded-3xl outline-none"
          >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {/* Close button floats over the hero */}
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="absolute right-3 top-3 z-10 h-8 w-8 inline-flex items-center justify-center rounded-full bg-bg-elev/70 backdrop-blur text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors"
            >
              <X size={15} />
            </button>
          </Dialog.Close>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-fg-muted">
              <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Loading…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-fg-muted">
              <AlertCircle size={18} className="text-danger" /> <span className="text-sm">{errorLabel}</span>
            </div>
          ) : !current ? (
            <div className="h-32" />
          ) : (
            <>
              {/* Hero with a soft status-tinted glow */}
              <div className="relative shrink-0 px-5 pt-5 pb-3">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-72 rounded-full blur-3xl opacity-25"
                  style={{ background: `radial-gradient(circle, hsl(${glow}), transparent 70%)` }}
                />
                <div className="relative">{hero}</div>
              </div>

              {/* Tab pill */}
              <TabPill tabs={tabs} current={current} onTabChange={onTabChange} />

              {/* Body — solid content surface (glass stays on the hero/footer
                  chrome only). All tabs mounted; only the active one is shown. */}
              <div className="flex-1 overflow-y-auto bg-bg px-4 pt-1 pb-4">
                {tabs.map((t) => {
                  const active = t.id === current.id;
                  return (
                    <div
                      key={t.id}
                      hidden={!active}
                      className={cn("space-y-2.5", active && "animate-in fade-in-0 slide-in-from-bottom-1 duration-200")}
                    >
                      {t.content}
                    </div>
                  );
                })}
              </div>

              {/* Sticky action bar */}
              {actionBar && (
                <div className="shrink-0 border-t border-border/70 bg-bg-elev px-4 py-2.5">
                  {actionBar}
                </div>
              )}
            </>
          )}
          </motion.div>
        </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Shared hero + tab pill + scrolling body + sticky action bar. Rendered by the
 *  full-screen-sheet path; the centred-card path inlines the same structure. */
function DrawerBody({
  glow,
  hero,
  tabs,
  current,
  onTabChange,
  actionBar,
  loading,
  error,
  errorLabel,
}: {
  glow: string;
  hero: ReactNode;
  tabs: DrawerTab[];
  current: DrawerTab | undefined;
  onTabChange: (id: string) => void;
  actionBar?: ReactNode;
  loading?: boolean;
  error?: boolean;
  errorLabel?: string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-fg-muted">
        <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-fg-muted">
        <AlertCircle size={18} className="text-danger" /> <span className="text-sm">{errorLabel}</span>
      </div>
    );
  }
  if (!current) return <div className="h-32" />;
  return (
    <>
      {/* Hero with a soft status-tinted glow */}
      <div className="relative shrink-0 px-5 pt-5 pb-3">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-72 rounded-full blur-3xl opacity-25"
          style={{ background: `radial-gradient(circle, hsl(${glow}), transparent 70%)` }}
        />
        <div className="relative">{hero}</div>
      </div>

      {/* Tab pill */}
      <TabPill tabs={tabs} current={current} onTabChange={onTabChange} />

      {/* Body — solid content surface (glass stays on the hero/footer chrome). */}
      <div className="flex-1 overflow-y-auto bg-bg px-4 pt-1 pb-4">
        {tabs.map((t) => {
          const active = t.id === current.id;
          return (
            <div
              key={t.id}
              hidden={!active}
              className={cn("space-y-2.5", active && "animate-in fade-in-0 slide-in-from-bottom-1 duration-200")}
            >
              {t.content}
            </div>
          );
        })}
      </div>

      {/* Sticky action bar */}
      {actionBar && (
        <div className="shrink-0 border-t border-border/70 bg-bg-elev px-4 py-2.5">
          {actionBar}
        </div>
      )}
    </>
  );
}

/**
 * Scrollable segmented tab pill. On phones the row can overflow, so:
 *  - a right-edge mask-fade hints there's more to the right (and clears once
 *    you scroll to the end);
 *  - the active tab is scrolled into view whenever it changes;
 *  - on the narrowest screens, with 5+ tabs, labels collapse to icons to keep
 *    every tab reachable without horizontal scrolling.
 */
function TabPill({
  tabs,
  current,
  onTabChange,
}: {
  tabs: DrawerTab[];
  current: DrawerTab;
  onTabChange: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the active tab visible as it changes (it can sit off-screen on phones).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [current.id]);

  // Only tabs without `hidden` appear in the pill; hidden ones stay mounted in
  // the body (for summaries) and are reached programmatically.
  const visible = tabs.filter((t) => !t.hidden);
  if (visible.length <= 1) return null;
  // Collapse to icons on the narrowest screens once the row gets crowded.
  const iconOnly = visible.length >= 5 && visible.every((t) => t.icon != null);

  return (
    <div className="shrink-0 px-4 pb-2">
      <div
        ref={scrollRef}
        style={{
          maskImage: "linear-gradient(to right, #000 calc(100% - 1.5rem), transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 1.5rem), transparent 100%)",
        }}
        className="-mx-4 px-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        <div className="inline-flex w-max items-center gap-1 p-1 rounded-full bg-bg-elev ring-1 ring-border">
          {visible.map((t) => {
            const active = t.id === current.id;
            return (
              <button
                key={t.id}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => onTabChange(t.id)}
                aria-label={iconOnly ? t.label : undefined}
                title={iconOnly ? t.label : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-full transition-all",
                  iconOnly && "max-[380px]:px-2.5",
                  active ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
                )}
              >
                {t.icon}
                <span className={cn(iconOnly && "max-[380px]:sr-only")}>{t.label}</span>
                {t.badge != null && (
                  <span className={cn("text-xs tabular", iconOnly && "max-[380px]:hidden", active ? "text-accent-fg/80" : "text-fg-subtle")}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
