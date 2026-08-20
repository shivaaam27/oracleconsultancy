"use client";

import { useEffect, useState } from "react";
import { Check, Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * "Install this as an app."
 *
 * COS is already a full progressive web app — manifest, service worker, offline
 * page, icons, push. Windows, Android and iOS will all install it into the Start
 * menu / home screen, giving a real window with our icon and no browser bar.
 * What was missing was anyone TELLING people, so almost nobody had done it.
 *
 * WHY THIS IS THE PRIMARY ROUTE ON WINDOWS. There is no file to download, so
 * there is nothing for SmartScreen, antivirus or an IT policy to block, and
 * nothing to code-sign. The browser does the installing. It also updates the
 * instant anything is pushed, because it IS the website.
 *
 * Three cases, because the browsers genuinely differ:
 *   1. Already installed  → say so, offer nothing.
 *   2. Chrome / Edge      → the real one-click install, via beforeinstallprompt.
 *   3. Safari / iOS       → no API exists; show the Share → Add to Home Screen
 *                           steps instead of a dead button.
 * ------------------------------------------------------------------ */

/** The event Chrome and Edge fire when the app is installable. Not in lib.dom. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "checking" | "installed" | "ready" | "ios" | "unsupported";

/** Where the pre-hydration script parks the event. See InstallPromptScript. */
declare global {
  interface Window {
    __cosInstallPrompt?: InstallPromptEvent | null;
  }
}

/* ⚠️ Chrome fires `beforeinstallprompt` within milliseconds of the page load —
 * usually BEFORE React has hydrated — and it never fires again for that page.
 * A listener added in a useEffect therefore misses it, and the button silently
 * never appears. (Caught exactly that way: the event never arrived in a live
 * test, while the service worker and manifest were both fine.)
 *
 * So the event is caught by a plain inline script in the document head, parked
 * on window, and picked up here. Mount this ONCE in the root layout <head>,
 * beside PortalPrefsScript. */
export function InstallPromptScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          "window.__cosInstallPrompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__cosInstallPrompt=e;window.dispatchEvent(new Event('cos:installable'));});window.addEventListener('appinstalled',function(){window.__cosInstallPrompt=null;window.dispatchEvent(new Event('cos:installed'));});",
      }}
    />
  );
}

export function InstallApp({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("checking");
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Running as an installed app? Then there is nothing to offer. iOS reports
    // this through a non-standard `standalone` flag rather than the media query.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setMode("installed");
      return;
    }

    // iOS Safari has no install API at all — only the Share sheet. Detect the
    // platform rather than waiting for an event that will never arrive.
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
    if (isIos) {
      setMode("ios");
      return;
    }

    // The event has almost certainly already fired and been parked by
    // InstallPromptScript — that is the whole reason it exists.
    const take = () => {
      const parked = window.__cosInstallPrompt;
      if (parked) {
        setPrompt(parked);
        setMode("ready");
        return true;
      }
      return false;
    };
    if (take()) return;

    // Not parked yet. Listen for both the script's relay and the raw event, in
    // case this component mounted before the browser got round to firing it.
    const onPrompt = (e: Event) => {
      if (!take()) {
        (e as InstallPromptEvent).preventDefault?.();
        setPrompt(e as InstallPromptEvent);
        setMode("ready");
      }
    };
    window.addEventListener("cos:installable", onPrompt);
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => {
      setMode("installed");
      setPrompt(null);
    };
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("cos:installed", onInstalled);

    // If it has still not arrived, the browser either cannot install (Firefox,
    // an in-app browser) or already has it. Show the manual route rather than a
    // button that does nothing.
    const timer = setTimeout(() => setMode((m) => (m === "checking" ? "unsupported" : m)), 2500);

    return () => {
      window.removeEventListener("cos:installable", onPrompt);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("cos:installed", onInstalled);
      clearTimeout(timer);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setMode("installed");
      // A dismissed prompt cannot be re-fired — the browser only hands it over
      // once per page load. Keep the button; a reload gets a fresh one.
    } catch {
      /* the prompt was already used or the browser refused — leave the UI as-is */
    } finally {
      setBusy(false);
      setPrompt(null);
      // The browser hands the event over once only; a reload gets a fresh one.
      window.__cosInstallPrompt = null;
    }
  }

  if (mode === "checking") return null;

  if (mode === "installed") {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <Check size={14} /> Installed — you&apos;re using the app.
      </p>
    );
  }

  if (mode === "ready") {
    return (
      <div className="flex flex-col gap-2">
        <Button onClick={install} loading={busy} disabled={busy} className="w-fit">
          <Download size={14} /> {busy ? "Installing…" : "Install the app"}
        </Button>
        {!compact && (
          <p className="text-[11px] text-fg-subtle">
            Adds it to your Start menu and taskbar, in its own window with no address bar. Nothing is
            downloaded and it keeps updating itself.
          </p>
        )}
      </div>
    );
  }

  if (mode === "ios") {
    return (
      <div className="text-sm text-fg-muted">
        <p className="mb-1.5">To add it to your home screen:</p>
        <ol className="ml-1 space-y-1 text-[13px]">
          <li className="flex items-center gap-2">
            <Share size={13} className="shrink-0 text-accent" /> 1. Tap Share at the bottom of Safari
          </li>
          <li className="flex items-center gap-2">
            <SquarePlus size={13} className="shrink-0 text-accent" /> 2. Choose &ldquo;Add to Home
            Screen&rdquo;
          </li>
        </ol>
      </div>
    );
  }

  // Firefox, or an in-app browser. Nothing to automate — say where the menu is.
  return (
    <p className="text-[13px] text-fg-muted">
      Open this page in <span className="font-medium text-fg">Microsoft Edge</span> or Chrome, then
      use the menu (⋯) → <span className="font-medium text-fg">Apps</span> →{" "}
      <span className="font-medium text-fg">Install this site as an app</span>.
    </p>
  );
}
