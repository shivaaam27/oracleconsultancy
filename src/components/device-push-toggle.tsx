"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "loading" | "unsupported" | "off" | "on" | "denied";

/** Enable/disable web-push on this device for the signed-in user (staff
 *  portal or owner). Subscribes via /api/push/subscribe, which stores it
 *  against whoever is signed in. No "test" button (that's owner-only). */
export function DevicePushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      if (!VAPID_PUBLIC) throw new Error("Notifications aren't set up on the server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("Couldn't save this device.");
      setState("on");
      setMsg("You'll get alerts on this device.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("Alerts off on this device.");
    } catch {
      setMsg("Couldn't turn off alerts.");
    } finally {
      setBusy(false);
    }
  }

  const btn = "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors";

  return (
    <div className="flex flex-col gap-2">
      {state === "loading" && (
        <p className="inline-flex items-center gap-2 text-sm text-fg-muted"><Loader2 size={14} className="animate-spin" /> Checking…</p>
      )}
      {state === "unsupported" && (
        <p className="text-sm text-fg-muted">This browser can&apos;t do push alerts. On iPhone, add the portal to your Home Screen first, then enable here.</p>
      )}
      {state === "denied" && (
        <p className="text-sm text-warn">Notifications are blocked. Allow them for this site in your browser settings, then come back.</p>
      )}
      {state === "off" && (
        <button type="button" onClick={enable} disabled={busy} className={`${btn} bg-accent text-accent-fg disabled:opacity-60`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Enable on this device
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-success"><Bell size={14} /> Alerts are on for this device.</span>
          <button type="button" onClick={disable} disabled={busy} className={`${btn} bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg`}>
            <BellOff size={14} /> Turn off
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-fg-subtle">{msg}</p>}
    </div>
  );
}
