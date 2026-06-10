"use client";

import { useActionState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { PasswordField, ShakeOnError } from "@/components/auth-fields";
import { adminLogin, adminSetup, type LoginState } from "./actions";

export function AdminLoginForm({ firstRun }: { firstRun: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    firstRun ? adminSetup : adminLogin,
    null
  );
  return (
    <ShakeOnError errorKey={state?.error ?? null}>
      <form action={action} className="flex flex-col gap-3">
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
