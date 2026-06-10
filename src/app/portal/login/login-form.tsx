"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { portalLogin } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(portalLogin, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Name or email</span>
        <input
          name="identifier"
          autoComplete="username"
          required
          className="rounded-2xl bg-bg-subtle ring-1 ring-border px-4 py-3 text-sm outline-none focus:ring-accent/50"
          placeholder="e.g. Shivam"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-2xl bg-bg-subtle ring-1 ring-border px-4 py-3 text-sm outline-none focus:ring-accent/50"
          placeholder="••••••••"
        />
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
  );
}
