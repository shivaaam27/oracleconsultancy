"use client";

import { useActionState, useEffect, useRef } from "react";
import { LogIn } from "lucide-react";
import { PasswordField, ShakeOnError, authInputCls } from "@/components/auth-fields";
import { portalLogin } from "../actions";

const REMEMBER_KEY = "portal.rememberedName";

export function LoginForm() {
  const [state, action, pending] = useActionState(portalLogin, null);
  const nameRef = useRef<HTMLInputElement>(null);

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
          if (v) localStorage.setItem(REMEMBER_KEY, v);
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Name or email</span>
          <input
            ref={nameRef}
            name="identifier"
            autoComplete="username"
            required
            className={authInputCls}
            placeholder="e.g. Shivam"
          />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" />
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
