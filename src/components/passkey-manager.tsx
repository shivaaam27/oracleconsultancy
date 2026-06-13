"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import { ScanFace, Fingerprint, Trash2, Plus } from "lucide-react";
import { Button } from "./ui";

export type PasskeyRow = { id: number; label: string | null; created_at: string; last_used_at: string | null };

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

function relDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Add / list / remove passkeys (Face ID, fingerprint). Used by the owner in
 *  Settings and by staff on their portal profile — pass the matching actions. */
export function PasskeyManager({ initial, begin, finish, remove }: {
  initial: PasskeyRow[];
  begin: () => Promise<PublicKeyCredentialCreationOptionsJSON>;
  finish: (response: RegistrationResponseJSON, label: string | null) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: number) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setSupported(browserSupportsWebAuthn()); }, []);

  async function add() {
    setBusy(true); setErr(null);
    try {
      const optionsJSON = await begin();
      const response = await startRegistration({ optionsJSON });
      const res = await finish(response, deviceLabel());
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Couldn't add this device.");
    } catch (e) {
      if (!(e instanceof Error) || e.name !== "NotAllowedError") setErr("Couldn't add a passkey on this device.");
    } finally { setBusy(false); }
  }

  async function del(id: number) {
    setBusy(true); setErr(null);
    const res = await remove(id);
    if (res.ok) router.refresh(); else setErr(res.error ?? "Couldn't remove it.");
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {initial.length > 0 && (
        <ul className="rounded-xl ring-1 ring-border/60 divide-y divide-border/50 overflow-hidden">
          {initial.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <Fingerprint size={16} className="text-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{c.label ?? "Passkey"}</div>
                <div className="text-[11px] text-fg-subtle">Added {relDate(c.created_at)}{c.last_used_at ? ` · last used ${relDate(c.last_used_at)}` : ""}</div>
              </div>
              <button type="button" disabled={busy} onClick={() => del(c.id)} title="Remove" className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-danger hover:bg-danger-soft/50 transition-colors"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}

      {supported ? (
        <Button type="button" disabled={busy} onClick={add}>
          <ScanFace size={15} /> {busy ? "Follow your device…" : initial.length ? "Add another device" : "Add Face ID / fingerprint"}
        </Button>
      ) : (
        <p className="text-xs text-fg-subtle">This device or browser doesn&apos;t support passkeys.</p>
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}
