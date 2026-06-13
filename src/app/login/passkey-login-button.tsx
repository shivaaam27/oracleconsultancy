"use client";

import { useEffect, useState } from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { ScanFace } from "lucide-react";
import { startPasskeyLogin, completePasskeyLogin } from "./passkey-actions";

/** "Sign in with Face ID / fingerprint" — discoverable WebAuthn login that
 *  works for both the owner and staff (the credential tells us who). */
export function PasskeyLoginButton() {
  const [supported, setSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setSupported(browserSupportsWebAuthn()); }, []);
  if (!supported) return null;

  async function go() {
    setPending(true); setErr(null);
    try {
      const optionsJSON = await startPasskeyLogin();
      const response = await startAuthentication({ optionsJSON });
      const res = await completePasskeyLogin(response);
      if (res.ok && res.redirect) window.location.assign(res.redirect);
      else setErr(res.error ?? "Couldn't sign in.");
    } catch (e) {
      // User cancelled the prompt — stay quiet; anything else is a real error.
      if (!(e instanceof Error) || e.name !== "NotAllowedError") setErr("Couldn't sign in with this device.");
    } finally { setPending(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex items-center gap-3 py-1 text-[11px] text-fg-subtle">
        <span className="h-px flex-1 bg-border/70" /> or <span className="h-px flex-1 bg-border/70" />
      </div>
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-bg-subtle ring-1 ring-border px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-bg-muted/70 disabled:opacity-60"
      >
        <ScanFace size={16} /> {pending ? "Waiting for your device…" : "Sign in with Face ID or fingerprint"}
      </button>
      {err && <p className="text-center text-xs text-danger">{err}</p>}
    </div>
  );
}
