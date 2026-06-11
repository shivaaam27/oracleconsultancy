"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";

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

export function NotificationSettings() {
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
      if (!VAPID_PUBLIC) throw new Error("Notifications are not configured on the server.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));
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
      if (!res.ok) throw new Error("Could not save subscription.");
      setState("on");
      setMsg("This device will now receive alerts.");
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
      setMsg("Alerts turned off on this device.");
    } catch {
      setMsg("Could not turn off alerts.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json();
      setMsg(res.ok ? `Sent to ${data.sent} device${data.sent === 1 ? "" : "s"}.` : data.error || "Test failed.");
    } catch {
      setMsg("Test failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {state === "loading" && (
        <p className="text-sm text-fg-muted inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Checking…
        </p>
      )}

      {state === "unsupported" && (
        <p className="text-sm text-fg-muted inline-flex items-center gap-2">
          <AlertCircle size={14} /> This browser doesn&apos;t support push notifications. On iPhone, add Oracle Consultancy to your
          Home Screen first, then enable here.
        </p>
      )}

      {state === "denied" && (
        <p className="text-sm text-amber-600 dark:text-amber-400 inline-flex items-center gap-2">
          <BellOff size={14} /> Notifications are blocked. Allow them for this site in your browser settings, then
          return here.
        </p>
      )}

      {state === "off" && (
        <Button type="button" onClick={enable} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />} Enable on this device
        </Button>
      )}

      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Bell size={14} /> Alerts are on for this device.
          </span>
          <Button type="button" variant="ghost" onClick={test} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send test
          </Button>
          <Button type="button" variant="ghost" onClick={disable} disabled={busy}>
            <BellOff size={13} /> Turn off
          </Button>
        </div>
      )}

      {msg && <p className="text-xs text-fg-muted">{msg}</p>}
    </div>
  );
}
