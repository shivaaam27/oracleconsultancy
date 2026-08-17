"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { KeyRound, Check, Eye, EyeOff } from "lucide-react";
import { portalChangePassword } from "@/app/portal/actions";

/* Self-service password change for any portal user (staff/manager/director).
 * Re-verifies the current password server-side before changing it. */
export function PortalPassword() {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [state, action, pending] = useActionState(portalChangePassword, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields and collapse once the change succeeds.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      const t = setTimeout(() => setOpen(false), 1800);
      return () => clearTimeout(t);
    }
  }, [state?.ok]);

  const inputCls =
    "w-full rounded-2xl bg-bg-subtle ring-1 ring-border px-3.5 py-2.5 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-bg-subtle ring-1 ring-border px-4 text-sm font-medium hover:ring-accent/40 transition-colors"
      >
        <KeyRound size={15} /> Change my password
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <div className="relative">
        <input
          name="current"
          type={show ? "text" : "password"}
          required
          autoComplete="current-password"
          placeholder="Current password"
          className={inputCls}
        />
      </div>
      <div className="relative">
        <input
          name="next"
          type={show ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="New password (at least 8 characters)"
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide passwords" : "Show passwords"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <input
        name="confirm"
        type={show ? "text" : "password"}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="Confirm new password"
        className={inputCls}
      />

      {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state?.ok && (
        <p className="inline-flex items-center gap-1.5 text-sm text-success">
          <Check size={15} /> Password updated.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Update password"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-9 items-center px-2 text-sm text-fg-muted hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
