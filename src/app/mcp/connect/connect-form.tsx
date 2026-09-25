"use client";

// The consent form, in Studio (25 Sept 2026). Deliberately the same furniture as
// the sign-in screen (studio-sign-in.tsx) — the same fields, the same black
// button, the same "who are you" switch — so it doesn't feel like it belongs to
// somebody else's website, which is exactly the feeling a phishing page gives.
//
// Behaviour is unchanged from the Aurora version: the hidden fields carry the
// request back to the server actions, which re-validate all of it; `who` says
// which door the password is checked against; Cancel declines.

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck, UserRound } from "lucide-react";
import { ShakeOnError } from "@/components/auth-fields";
import { cn } from "@/lib/cn";
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

const FIELD = "h-11 sm:h-12 w-full rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3.5 text-[15px] text-[var(--st-ink)] outline-none transition-colors placeholder:text-[var(--st-muted)] focus:border-[var(--st-ink)]";
const PRIMARY = "inline-flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--st-ink)] text-[15px] font-semibold text-[var(--st-page)] transition-opacity hover:opacity-90 disabled:opacity-60";
/** A soft block that reads on the white card (phone) AND on the grey page (desk). */
const SOFT = "rounded-[14px] bg-[var(--st-page)] lg:bg-[var(--st-surface)]";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(PRIMARY, "mt-1")}>
      {pending && <Loader2 size={16} className="animate-spin" />}
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
    <div className="flex flex-col gap-3.5 sm:gap-5">
      {/* What is being granted — before anything to press. */}
      <div className={cn(SOFT, "flex items-start gap-3 px-4 py-3.5")}>
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--st-ok-text)]" aria-hidden />
        <div className="text-[13px] leading-relaxed">
          <p className="m-0">
            It will be able to read and change what <em>you</em> are allowed to read and change — nothing more.
            It can never delete anything or send a message on your behalf.
          </p>
          <p className="m-0 mt-1.5 text-[var(--st-muted)]">You can disconnect it at any time in Settings.</p>
        </div>
      </div>

      {signedInAs ? (
        <ShakeOnError errorKey={state?.error ?? null}>
          <form action={action} className="flex flex-col gap-3">
            {hidden}
            <input type="hidden" name="who" value={signedInAs.kind} />
            <div className={cn(SOFT, "flex items-center gap-3 px-4 py-3")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--st-seg)]">
                {signedInAs.kind === "owner" ? <ShieldCheck size={16} /> : <UserRound size={16} />}
              </span>
              <div className="min-w-0 text-[13px]">
                <div className="text-[var(--st-muted)]">Signed in as</div>
                <div className="truncate text-[15px] font-medium">{signedInAs.name}</div>
              </div>
            </div>
            {state?.error && <Err>{state.error}</Err>}
            <Submit label="Approve" />
          </form>
        </ShakeOnError>
      ) : (
        <>
          {/* Who you are: the sign-in screen's own two-option switch. */}
          <div role="radiogroup" aria-label="Signing in as" className="relative grid grid-cols-2 rounded-[14px] bg-[var(--st-seg)] p-1">
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[11px] bg-[var(--st-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
              style={{ transform: who === "owner" ? "translateX(100%)" : "translateX(0)" }}
            />
            {([["staff", "Team member", UserRound], ["owner", "Administrator", ShieldCheck]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={who === v}
                onClick={() => setWho(v)}
                className={cn("relative z-10 flex h-10 items-center justify-center gap-2 rounded-[11px] text-[14px] text-[var(--st-ink)] transition-colors sm:h-11", who === v && "font-semibold")}
              >
                <Icon size={16} />{label}
              </button>
            ))}
          </div>

          <ShakeOnError errorKey={state?.error ?? null}>
            <form action={action} className="flex flex-col gap-2.5 sm:gap-3">
              {hidden}
              <input type="hidden" name="who" value={who} />

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">
                  {who === "staff" ? "Your name or email" : "Your name or email (if you've set one)"}
                </span>
                <input
                  name="identifier"
                  autoComplete="username"
                  className={FIELD}
                  /* Never a real address here: this consent screen sits OUTSIDE the
                     admin gate (see the matcher in `src/proxy.ts`), so a placeholder
                     is public. It used to name an actual member of staff. */
                  placeholder={who === "staff" ? "" : "Leave blank if you haven't"}
                />
              </label>

              <Password />

              {state?.error && <Err>{state.error}</Err>}
              <Submit label="Sign in and approve" />
            </form>
          </ShakeOnError>
        </>
      )}

      <form action={denyConnection}>
        {hidden}
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-[12px] border border-[var(--st-line)] bg-transparent text-[14px] text-[var(--st-ink)] transition-colors hover:bg-[var(--st-seg)] sm:h-12"
        >
          Cancel
        </button>
      </form>

      <p className="m-0 flex items-center justify-center gap-1.5 text-xs text-[var(--st-muted)]">
        <Lock size={12} aria-hidden />
        Only approve this if you started it yourself.
      </p>
    </div>
  );
}

function Password() {
  const [show, setShow] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">Password</span>
      <span className="relative">
        <input
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          required
          className={cn(FIELD, "pr-12")}
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--st-muted)] hover:text-[var(--st-ink)]"
        >
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </label>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="m-0 rounded-[10px] bg-[var(--st-bad-wash)] px-3 py-2.5 text-[13px] text-[var(--st-late-text)]">{children}</p>;
}
