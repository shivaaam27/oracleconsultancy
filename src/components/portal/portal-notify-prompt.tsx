"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { NudgeCard } from "./portal-install-prompt";

/* Portal "Turn on notifications" nudge.
 *
 * Push is opt-in by the browser — a staff member only gets push alerts (and the
 * sound) for chat messages / task reminders once they've granted permission and
 * subscribed on THIS device. That control was buried in Profile, so most people
 * never turned it on and only saw the in-app bell. This surfaces a gentle, one-
 * tap prompt right in the portal. Shown only when push is supported AND
 * permission is still "default" (not granted, not blocked) AND there's no live
 * subscription yet. Dismissals snooze for 14 days so we never nag.
 *
 * iOS note: the Push API only exists in an INSTALLED PWA (Add to Home Screen),
 * so on plain iOS Safari `PushManager`/`Notification` are absent and this stays
 * hidden — the install prompt covers that first step. */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const DISMISS_KEY = "cos.notifyPrompt.dismissedAt";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return !!raw && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function PortalNotifyPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return;
      if (!VAPID_PUBLIC) return;
      if (Notification.permission !== "default") return; // already granted or blocked
      if (recentlyDismissed()) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        // One nudge at a time: the install card goes first.
        await new Promise((r) => setTimeout(r, 1500));
        if (document.querySelector('[data-nudge="install"]')) return;
        if (!sub) setShow(true);
      } catch {
        setShow(true);
      }
    })();
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
    setShow(false);
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setShow(false); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
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
      setMsg("Done — you'll get alerts on this device.");
      setTimeout(() => setShow(false), 1500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <NudgeCard
      id="notify"
      icon={<span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]"><Bell size={17} /></span>}
      title="Turn on notifications"
      onDismiss={dismiss}
      action={msg ? undefined : { label: "Turn on", icon: busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />, onClick: () => void enable(), busy }}
    >
      {msg ?? "Hear the moment a task is given to you or needs you — not only on the bell."}
    </NudgeCard>
  );
}
