"use client";

// The consent form. Aurora, and deliberately the same furniture as /login so it
// doesn't feel like it belongs to somebody else's website — which is exactly the
// feeling a phishing page gives.

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ShieldCheck, Lock } from "lucide-react";
import { approveConnection, denyConnection, type ConnectState } from "./actions";

export type ConnectParams = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
  resource: string | null;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Connecting…" : label}
    </button>
  );
}

export function ConnectForm({
  params,
  signedInAs,
}: {
  params: ConnectParams;
  /** Who the browser is already signed in as, if anyone. */
  signedInAs: { kind: "owner" | "staff"; name: string } | null;
}) {
  const [who, setWho] = useState<"owner" | "staff">(signedInAs?.kind === "staff" ? "staff" : "owner");
  const [state, action] = useActionState<ConnectState, FormData>(approveConnection, null);

  const hidden = (
    <>
      <input type="hidden" name="client_id" value={params.clientId} />
      <input type="hidden" name="redirect_uri" value={params.redirectUri} />
      <input type="hidden" name="code_challenge" value={params.codeChallenge} />
      <input type="hidden" name="code_challenge_method" value={params.codeChallengeMethod} />
      <input type="hidden" name="state" value={params.state} />
      <input type="hidden" name="scope" value={params.scope} />
      <input type="hidden" name="resource" value={params.resource ?? ""} />
    </>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-bg-subtle/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">{params.clientName} wants to connect to COS</p>
            <p className="mt-1 text-fg-muted">
              It will be able to read and change what <em>you</em> are allowed to read and change — nothing more.
              It can never delete anything or send a message on your behalf.
            </p>
            <p className="mt-1 text-fg-subtle">You can disconnect it at any time in Settings.</p>
          </div>
        </div>
      </div>

      {signedInAs ? (
        <form action={action} className="space-y-3">
          {hidden}
          <input type="hidden" name="who" value={signedInAs.kind} />
          <p className="text-sm text-fg-muted">
            Signed in as <span className="font-medium text-fg">{signedInAs.name}</span>.
          </p>
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <Submit label="Approve" />
        </form>
      ) : (
        <>
          <div className="flex rounded-xl bg-bg-subtle p-1 text-sm">
            {(["owner", "staff"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWho(k)}
                className={`flex-1 rounded-lg px-3 py-1.5 font-medium transition ${
                  who === k ? "bg-bg shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {k === "owner" ? "Administrator" : "Staff"}
              </button>
            ))}
          </div>

          <form action={action} className="space-y-3">
            {hidden}
            <input type="hidden" name="who" value={who} />

            <label className="block space-y-1">
              <span className="text-xs font-medium text-fg-muted">
                {who === "staff" ? "Your name or email" : "Your name or email (if you've set one)"}
              </span>
              <input
                name="identifier"
                autoComplete="username"
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                /* Never a real address here: this consent screen sits OUTSIDE the
                   admin gate (see the matcher in `src/proxy.ts`), so a placeholder
                   is public. It used to name an actual member of staff. */
                placeholder={who === "staff" ? "" : "Leave blank if you haven't"}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-fg-muted">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>

            {state?.error && <p className="text-sm text-danger">{state.error}</p>}
            <Submit label="Sign in and approve" />
          </form>
        </>
      )}

      <form action={denyConnection}>
        {hidden}
        <button type="submit" className="w-full rounded-xl px-4 py-2 text-sm text-fg-muted transition hover:text-fg">
          Cancel
        </button>
      </form>

      <p className="flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
        <Lock className="h-3 w-3" aria-hidden />
        Only approve this if you started it yourself.
      </p>
    </div>
  );
}
