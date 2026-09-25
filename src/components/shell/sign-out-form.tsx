"use client";

/**
 * A sign-out form that first takes THIS device off the alert list (push audit,
 * 25 Sept 2026: signing out left the phone receiving that person's alerts —
 * on a shared phone, the next person saw the last one's chats and tasks).
 *
 * It asks the browser for its push subscription, tells the server to forget
 * it, unsubscribes, and only then signs out. The whole detour is capped at
 * 1.5 seconds, so a slow network never holds anyone on a page they asked to
 * leave. Everything else about the form is untouched.
 */
import { useRef, type ReactNode } from "react";

async function forgetThisDevice(): Promise<void> {
  // Drop the remembered portal sign-in too (portal-session.tsx), or the sign-in
  // screen would quietly sign the same person straight back in.
  try { localStorage.removeItem("cos_portal_remember"); } catch { /* private mode */ }
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 700)),
    ]);
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch { /* never stand between someone and signing out */ }
}

export function SignOutForm({ action, className, children }: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const ready = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={action}
      className={className}
      onSubmit={(e) => {
        if (ready.current) return;
        e.preventDefault();
        void Promise.race([forgetThisDevice(), new Promise((r) => setTimeout(r, 1500))]).then(() => {
          ready.current = true;
          form.current?.requestSubmit();
        });
      }}
    >
      {children}
    </form>
  );
}
