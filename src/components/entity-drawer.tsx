"use client";

import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type DrawerTab = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Small count/dot shown next to the label. */
  badge?: ReactNode;
  content: ReactNode;
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
}) {
  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const glow =
    tone === "success" ? "var(--success)" : tone === "warn" ? "var(--warn)" : tone === "danger" ? "var(--danger)" : "var(--accent)";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          forceMount
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-200
            data-[state=open]:opacity-100 data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none"
        />
        <Dialog.Content
          forceMount
          aria-describedby={undefined}
          style={{ maxWidth }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] max-h-[90dvh] w-[calc(100%-1.5rem)]
            flex flex-col overflow-hidden glass glass-refract rounded-3xl outline-none
            transition-all duration-200 ease-out
            data-[state=open]:opacity-100 data-[state=open]:scale-100
            data-[state=closed]:opacity-0 data-[state=closed]:scale-[0.97] data-[state=closed]:pointer-events-none"
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
              {tabs.length > 1 && (
                <div className="shrink-0 px-4 pb-2">
                  <div className="-mx-4 px-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                    <div className="inline-flex w-max items-center gap-1 p-1 rounded-full glass elevated">
                      {tabs.map((t) => {
                        const active = t.id === current.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => onTabChange(t.id)}
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-full transition-all",
                              active ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
                            )}
                          >
                            {t.icon}
                            {t.label}
                            {t.badge != null && (
                              <span className={cn("text-xs tabular", active ? "text-accent-fg/80" : "text-fg-subtle")}>{t.badge}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Body — all tabs mounted (so summaries report + switching is
                  instant); only the active one is shown, with a gentle entrance. */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {tabs.map((t) => {
                  const active = t.id === current.id;
                  return (
                    <div
                      key={t.id}
                      hidden={!active}
                      className={cn("space-y-3", active && "animate-in fade-in-0 slide-in-from-bottom-1 duration-200")}
                    >
                      {t.content}
                    </div>
                  );
                })}
              </div>

              {/* Sticky action bar */}
              {actionBar && (
                <div className="shrink-0 border-t border-border/70 bg-bg-elev/60 backdrop-blur px-4 py-2.5">
                  {actionBar}
                </div>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
