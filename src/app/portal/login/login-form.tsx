"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { PasswordField, ShakeOnError, authInputCls } from "@/components/auth-fields";
import { portalLogin } from "../actions";

const REMEMBER_KEY = "portal.rememberedName";

export function LoginForm() {
  const [state, action, pending] = useActionState(portalLogin, null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(true);

  // Pre-fill the remembered name on this device.
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved && nameRef.current && !nameRef.current.value) nameRef.current.value = saved;
  }, []);

  return (
    <ShakeOnError errorKey={state?.error ?? null}>
      <form
        action={action}
        onSubmit={() => {
          const v = nameRef.current?.value.trim();
          if (remember && v) localStorage.setItem(REMEMBER_KEY, v);
          else localStorage.removeItem(REMEMBER_KEY);
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1.5">
          {/* The caption is for screen readers only. On screen the field says what
              to do itself ("Write your email"), which is the owner's wording — a
              caption plus an empty box read as two things to deal with, and the
              box looked broken while it was empty. The hint names nobody, which is
              why the real address had to go in the first place.
              NOTE: the server still accepts a NAME as well as an email here; the
              wording is deliberately narrower than the rule. */}
          <span className="sr-only">Email</span>
          <input
            ref={nameRef}
            name="identifier"
            autoComplete="username webauthn"
            required
            className={authInputCls}
            placeholder="Write your email"
          />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" />
        <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer select-none">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 rounded accent-[hsl(var(--accent))]" />
          Remember me on this device
        </label>
        {state?.error && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-accent text-accent-fg px-4 py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
        >
          <LogIn size={16} />
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </ShakeOnError>
  );
}
