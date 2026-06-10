"use client";

import { useActionState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { adminLogin, adminSetup, type LoginState } from "./actions";

const inputCls =
  "rounded-2xl bg-bg-subtle ring-1 ring-border px-4 py-3 text-sm outline-none focus:ring-accent/50";

export function AdminLoginForm({ firstRun }: { firstRun: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    firstRun ? adminSetup : adminLogin,
    null
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
          {firstRun ? "Choose a password (min 8 characters)" : "Password"}
        </span>
        <input
          name="password"
          type="password"
          autoComplete={firstRun ? "new-password" : "current-password"}
          required
          minLength={firstRun ? 8 : undefined}
          className={inputCls}
          placeholder="••••••••"
        />
      </label>
      {firstRun && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Type it again</span>
          <input name="confirm" type="password" autoComplete="new-password" required className={inputCls} placeholder="••••••••" />
        </label>
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
  );
}
