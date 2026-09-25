"use client";

import { useEffect, useState } from "react";
import { startAuthentication, browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } from "@simplewebauthn/browser";
import { ScanFace } from "lucide-react";
import { startPasskeyLogin, completePasskeyLogin } from "./passkey-actions";

/** A smart, platform-aware label: Face ID on iPhone, Touch ID on Mac, etc. */
function bioLabel(): string {
  if (typeof navigator === "undefined") return "a passkey";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "Face ID";
  if (/Macintosh/.test(ua)) return "Touch ID";
  if (/Android/.test(ua)) return "your fingerprint";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "a passkey";
}

/** Sits right under the password "Sign in" button. Offers biometric sign-in,
 *  and — on supported devices (e.g. iPhone) — auto-prompts it the moment the
 *  page loads via WebAuthn conditional UI (passkey autofill). */
/** `studio` — the Studio sign-in screen: a full-width outline button, 48px. */
export function PasskeyLoginButton({ studio = false }: { studio?: boolean } = {}) {
  const [supported, setSupported] = useState(false);
  const [label, setLabel] = useState("a passkey");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setSupported(browserSupportsWebAuthn()); setLabel(bioLabel()); }, []);

  // Conditional UI: quietly arm passkey autofill so the device can pop up
  // Face ID / fingerprint as soon as the user focuses the sign-in field.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill())) return;
        const optionsJSON = await startPasskeyLogin();
        const response = await startAuthentication({ optionsJSON, useBrowserAutofill: true });
        if (cancelled) return;
        const res = await completePasskeyLogin(response);
        if (res.ok && res.redirect) { rememberPasskeyUsed(); window.location.assign(res.redirect); }
      } catch {
        /* aborted / no passkey selected — this is normal, stay quiet */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!supported) return null;

  async function go() {
    setPending(true); setErr(null);
    try {
      const optionsJSON = await startPasskeyLogin();
      const response = await startAuthentication({ optionsJSON });
      const res = await completePasskeyLogin(response);
      if (res.ok && res.redirect) { rememberPasskeyUsed(); window.location.assign(res.redirect); }
      else setErr(res.error ?? "No passkey on this device yet — add one from your profile first.");
    } catch (e) {
      if (!(e instanceof Error) || e.name !== "NotAllowedError") setErr("Couldn't sign in with this device.");
    } finally { setPending(false); }
  }

  return (
    <div className={studio ? "flex flex-col gap-2" : "-mt-1 flex flex-col gap-2"}>
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className={studio
          ? "inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] text-[15px] font-medium text-[var(--st-ink)] transition-colors hover:border-[var(--st-ink)] disabled:opacity-60"
          : "inline-flex items-center justify-center gap-2 rounded-2xl bg-bg-subtle ring-1 ring-border px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-bg-muted/70 hover:ring-accent/40 disabled:opacity-60"}
      >
        <ScanFace size={studio ? 18 : 16} className={studio ? "" : "text-accent"} />
        {pending ? "Waiting for your device…" : `Use ${label} instead`}
      </button>
      {err && <p className={studio ? "m-0 text-center text-xs text-[var(--st-late-text)]" : "text-center text-xs text-danger"}>{err}</p>}
    </div>
  );
}

/** This device has signed in with a passkey before — the sign-in screen then
 *  puts the fingerprint / Face ID button first (26 Sept 2026). */
export const PASSKEY_USED_KEY = "cos.passkeyUsed";
function rememberPasskeyUsed() {
  try { window.localStorage.setItem(PASSKEY_USED_KEY, "1"); } catch { /* private window */ }
}
