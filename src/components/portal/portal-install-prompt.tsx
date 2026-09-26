"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, X, Share, Plus } from "lucide-react";

/* Portal "Install this app" prompt.
 *
 * Most staff won't know to "Add to Home Screen" themselves, so we nudge them —
 * but quietly, and only where it actually works:
 *   - Android / desktop Chrome+Edge: the browser fires `beforeinstallprompt`,
 *     which we capture and replay behind our own button (a real one-tap install).
 *   - iOS Safari: no such event exists, so we show the manual Share → Add to
 *     Home Screen steps instead.
 *   - Already installed (running standalone): render nothing.
 *
 * Dismissals are remembered for 14 days so we never nag.
 *
 * Studio look (owner, 26 Sept 2026: "make that also look modern"): a card that
 * floats above the footer instead of a bar pushed across the top of the page,
 * one nudge at a time — install first, notifications after (portal-notify-
 * prompt.tsx waits for this one). ⚠️ `beforeinstallprompt` fires BEFORE React
 * has hydrated, so the offer is read from where the head script parks it
 * (`window.__cosInstallPrompt`, install-app.tsx) — a listener added here alone
 * missed it and the Install button almost never appeared on Android. */

const DISMISS_KEY = "cos.installPrompt.dismissedAt";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// The browser hands us this event; it's not in the standard TS lib yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac; detect by touch
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  // Exclude Chrome/Firefox/Edge on iOS (they can't add to home screen anyway)
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit && !otherBrowser;
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

type Mode = "hidden" | "native" | "ios";

export function PortalInstallPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    // Android / desktop Chromium: the offer the head script parked, or the
    // one that arrives later.
    const w = window as unknown as { __cosInstallPrompt?: BeforeInstallPromptEvent | null };
    const take = () => { if (w.__cosInstallPrompt) { setDeferred(w.__cosInstallPrompt); setMode("native"); } };
    take();
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop Chrome's own mini-infobar; we drive it ourselves
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("native");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("cos:installable", take);

    // Once installed, never show again this session.
    const onInstalled = () => setMode("hidden");
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no event — decide up front and show the manual steps.
    if (isIosSafari()) setMode("ios");

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("cos:installable", take);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode — fine, just won't persist */
    }
    setMode("hidden");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Whatever they chose, the event is single-use — drop it and stand down.
    setDeferred(null);
    (window as unknown as { __cosInstallPrompt?: unknown }).__cosInstallPrompt = null;
    setMode("hidden");
  }

  if (mode === "hidden") return null;

  return (
    <NudgeCard
      id="install"
      icon={<img src="/icon-192.png" alt="" className="h-10 w-10 rounded-[11px]" />}
      title="Install Oracle on this device"
      onDismiss={dismiss}
      action={mode === "native" ? { label: "Install", icon: <Download size={14} />, onClick: install } : undefined}
    >
      {mode === "native" ? (
        "One tap to open, full screen, and it starts faster."
      ) : (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Step n={1}>Tap <Share size={12} className="inline" aria-label="Share" /> Share</Step>
          <Step n={2}>Add to Home Screen <Plus size={12} className="inline" aria-hidden /></Step>
        </span>
      )}
    </NudgeCard>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--sh-field)] px-2 py-1 text-[12px] text-[var(--sh-fg)]">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--sh-on-bg)] text-[10px] font-semibold text-[var(--sh-on-fg)]">{n}</span>
      {children}
    </span>
  );
}

/** A nudge: one small card floating above the footer (install, notifications). */
export function NudgeCard({ id, icon, title, children, onDismiss, action }: {
  id: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  onDismiss: () => void;
  action?: { label: string; icon?: ReactNode; onClick: () => void; busy?: boolean };
}) {
  return (
    <div data-nudge={id} role="dialog" aria-label={title}
      className="studio st-sheet st-pop print-hidden fixed inset-x-3 bottom-[calc(var(--foot-h)+var(--foot-safe)+12px)] z-[44] rounded-[18px] border border-[var(--sh-line)] bg-[var(--sh-bg)] p-3.5 text-[var(--sh-fg)] shadow-[0_18px_50px_rgba(17,18,20,0.22)] [font-family:var(--font-geist),var(--font-sans)] sm:left-auto sm:right-6 sm:w-[400px]">
      <div className="flex items-start gap-3">
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug">{title}</p>
          <div className="mt-1 text-[12.5px] leading-relaxed text-[var(--sh-sub)]">{children}</div>
          <div className="mt-3 flex items-center gap-2">
            {action && (
              <button type="button" onClick={action.onClick} disabled={action.busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--sh-on-bg)] px-3.5 text-[13px] font-semibold text-[var(--sh-on-fg)] transition-opacity hover:opacity-90 disabled:opacity-60">
                {action.icon}{action.label}
              </button>
            )}
            <button type="button" onClick={onDismiss} className="inline-flex h-9 items-center rounded-[10px] px-2.5 text-[13px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">Not now</button>
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]"><X size={15} /></button>
      </div>
    </div>
  );
}
