"use client";

import { useEffect, useState } from "react";
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
 * Dismissals are remembered for 14 days so we never nag. */

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

    // Android / desktop Chromium: the browser tells us install is available.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop Chrome's own mini-infobar; we drive it ourselves
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("native");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Once installed, never show again this session.
    const onInstalled = () => setMode("hidden");
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no event — decide up front and show the manual steps.
    if (isIosSafari()) setMode("ios");

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
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
    setMode("hidden");
  }

  if (mode === "hidden") return null;

  return (
    <div className="glass elevated rounded-2xl p-3.5 print-hidden">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
          <Download size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install the Oracle Consultancy app</p>
          {mode === "native" ? (
            <p className="mt-0.5 text-xs text-fg-muted">
              Add it to your device for one-tap access, full-screen and faster opening.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-fg-muted">
              In Safari, tap the Share button{" "}
              <Share size={12} className="inline -mt-0.5 mx-0.5" aria-label="Share" /> then{" "}
              <span className="whitespace-nowrap font-medium text-fg">
                Add to Home Screen <Plus size={12} className="inline -mt-0.5" aria-label="add" />
              </span>
              .
            </p>
          )}
          {mode === "native" && (
            <button
              type="button"
              onClick={install}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Download size={13} /> Install app
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 rounded-full p-1.5 text-fg-muted transition-colors hover:text-fg"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
