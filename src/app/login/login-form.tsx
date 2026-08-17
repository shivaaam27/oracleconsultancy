"use client";

import { useActionState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { PasswordField, ShakeOnError, authInputCls } from "@/components/auth-fields";
import { adminLogin, adminSetup, type LoginState } from "./actions";

export function AdminLoginForm({ firstRun }: { firstRun: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    firstRun ? adminSetup : adminLogin,
    null
  );
  return (
    <ShakeOnError errorKey={state?.error ?? null}>
      <form action={action} className="flex flex-col gap-3">
        {!firstRun && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Name or email</span>
            {/* NO placeholder. This field used to suggest the owner's real address,
                which handed anyone who opened the sign-in screen half of the second
                factor — the identity it is there to check. The label says what to
                type; a stranger should learn nothing from this page. */}
            <input name="identifier" autoComplete="username webauthn" className={authInputCls} />
          </label>
        )}
        <PasswordField
          name="password"
          label={firstRun ? "Choose a password (min 8 characters)" : "Password"}
          autoComplete={firstRun ? "new-password" : "current-password"}
          minLength={firstRun ? 8 : undefined}
        />
        {firstRun && (
          <PasswordField name="confirm" label="Type it again" autoComplete="new-password" />
        )}
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
          {firstRun ? <ShieldCheck size={16} /> : <LogIn size={16} />}
          {pending ? "One moment…" : firstRun ? "Set password & enter" : "Sign in"}
        </button>
      </form>
    </ShakeOnError>
  );
}
