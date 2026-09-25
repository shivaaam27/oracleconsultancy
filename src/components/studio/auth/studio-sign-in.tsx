"use client";

/**
 * The one sign-in screen (Studio, 25 Sept 2026) — served at BOTH /login and
 * /portal/login, so whichever address a device lands on, it offers both ways in.
 *
 * ⚠️ WHY IT IS ONE SCREEN: the owner kept finding a staff-only sign-in with no
 * Administrator option "at times". That was /portal/login — a separate page —
 * reached whenever a stale staff/director cookie sat on the device (the proxy
 * sent any cookie to /portal, and the portal sent a dead one to its own login).
 * Now both addresses render this, and the proxy only sends a VALID token to the
 * portal.
 *
 * Who you are is a two-option segmented switch (both visible, one tap — the
 * research answer for 2 choices; a dropdown hides them). The choice is
 * remembered on the device, so the owner lands on Administrator every time.
 * Face ID / fingerprint is offered as a peer of the password, not a footnote.
 * Desk: a split screen with the brand panel; phone: the form alone.
 */
import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Eye, EyeOff, Loader2, Moon, ShieldCheck, Sun, TriangleAlert, UserRound } from "lucide-react";
import { ShakeOnError } from "@/components/auth-fields";
import { PasskeyLoginButton } from "@/app/login/passkey-login-button";
import { adminLogin, adminSetup, type LoginState } from "@/app/login/actions";
import { portalLogin } from "@/app/portal/actions";
import { cn } from "@/lib/cn";

type As = "staff" | "admin";
const AS_KEY = "cos.signin.as";
const NAME_KEY = "portal.rememberedName";

const FIELD = "st-signin-field h-11 sm:h-12 w-full rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3.5 text-[15px] text-[var(--st-ink)] outline-none transition-colors placeholder:text-[var(--st-muted)] focus:border-[var(--st-ink)]";
const PRIMARY = "inline-flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--st-ink)] text-[15px] font-semibold text-[var(--st-page)] transition-opacity hover:opacity-90 disabled:opacity-60";

export function StudioSignIn({ firstRun, defaultAs = "staff" }: { firstRun: boolean; defaultAs?: As }) {
  const [as, setAs] = useState<As>(defaultAs);
  // The last choice on this device wins (read after mount — no flash on the server render).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AS_KEY);
      if (saved === "staff" || saved === "admin") setAs(saved);
    } catch { /* private window */ }
  }, []);
  const choose = (v: As) => {
    setAs(v);
    try { window.localStorage.setItem(AS_KEY, v); } catch { /* ignore */ }
  };

  return (
    <div className="studio fixed inset-0 z-[60] overflow-y-auto bg-[var(--st-page)] text-[var(--st-ink)] [font-family:var(--font-geist),var(--font-sans)]">
      <span className="hidden lg:contents"><ThemeButton /></span>
      <div className="mx-auto grid min-h-full max-w-[1280px] grid-cols-1 gap-5 p-3 sm:p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:p-5">
        <BrandPanel />

        <div className="flex flex-col items-center justify-center px-1 pb-2 pt-1 sm:px-2 sm:py-14">
          {/* Phone (owner, 25 Sept 2026): the whole screen fits without scrolling. */}
          <div className="flex w-full max-w-[440px] flex-col gap-3 sm:gap-6 lg:max-w-[400px]">
            {/* Phone and tablet: the brand panel, compact, above the form. */}
            <BrandCompact />

            <div className="flex flex-col gap-3.5 rounded-[22px] bg-[var(--st-surface)] p-4 sm:gap-6 sm:p-6 lg:bg-transparent lg:p-0">
            <div>
              <h1 className="m-0 text-[28px] font-medium leading-none tracking-[-0.035em] sm:text-[40px]">{firstRun && as === "admin" ? "Set up" : "Sign in"}</h1>
              <p className="m-0 mt-2.5 hidden text-[14px] text-[var(--st-ink)] sm:block">
                {firstRun && as === "admin" ? "Choose the administrator password to begin." : "Welcome back. Who are you signing in as?"}
              </p>
            </div>

            {/* Who you are: two visible choices, one tap. */}
            <div role="radiogroup" aria-label="Signing in as" className="relative grid grid-cols-2 rounded-[14px] bg-[var(--st-seg)] p-1">
              <span aria-hidden className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[11px] bg-[var(--st-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
                style={{ transform: as === "admin" ? "translateX(100%)" : "translateX(0)" }} />
              {([["staff", "Team member", UserRound], ["admin", "Administrator", ShieldCheck]] as const).map(([v, label, Icon]) => (
                <button key={v} type="button" role="radio" aria-checked={as === v} onClick={() => choose(v)}
                  className={cn("relative z-10 flex h-10 items-center justify-center gap-2 rounded-[11px] text-[14px] transition-colors sm:h-11", as === v ? "font-semibold text-[var(--st-ink)]" : "text-[var(--st-ink)] hover:text-[var(--st-ink)]")}>
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>

            <div key={as} className="st-pop flex flex-col gap-3 sm:gap-4">
              {as === "staff" ? <StaffForm /> : <AdminForm firstRun={firstRun} />}
              {!(firstRun && as === "admin") && (
                <>
                  <div className="flex items-center gap-3 text-xs text-[var(--st-ink)]" aria-hidden>
                    <span className="h-px flex-1 bg-[var(--st-line)]" />or<span className="h-px flex-1 bg-[var(--st-line)]" />
                  </div>
                  <PasskeyLoginButton studio />
                </>
              )}
            </div>

            <p className="m-0 hidden text-center text-xs leading-relaxed text-[var(--st-ink)] sm:block">
              {as === "staff"
                ? "No access yet? Ask your administrator to switch the portal on for you."
                : firstRun ? "You can add Face ID or a fingerprint from Settings afterwards." : "Forgot it? Reset it from Settings on a device that is already signed in."}
            </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaffForm() {
  const [state, action, pending] = useActionState(portalLogin, null);
  const name = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NAME_KEY);
      if (saved && name.current && !name.current.value) name.current.value = saved;
    } catch { /* ignore */ }
  }, []);
  return (
    <ShakeOnError errorKey={state?.error ?? null}>
      <form action={action} className="flex flex-col gap-2.5 sm:gap-3"
        onSubmit={() => {
          const v = name.current?.value.trim();
          try { if (remember && v) window.localStorage.setItem(NAME_KEY, v); else window.localStorage.removeItem(NAME_KEY); } catch { /* ignore */ }
        }}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--st-ink)]">Email</span>
          <input ref={name} id="signin-staff-identifier" name="identifier" autoComplete="username webauthn" required className={FIELD} placeholder="you@company.com" />
        </label>
        <Password id="signin-staff-password" name="password" label="Password" autoComplete="current-password" />
        <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13px] text-[var(--st-ink)] max-sm:-my-0.5">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[#111214]" />
          Remember me on this device
        </label>
        {state?.error && <Err>{state.error}</Err>}
        <button type="submit" disabled={pending} className={cn(PRIMARY, "mt-1")}>
          {pending && <Loader2 size={16} className="animate-spin" />}{pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </ShakeOnError>
  );
}

function AdminForm({ firstRun }: { firstRun: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(firstRun ? adminSetup : adminLogin, null);
  return (
    <ShakeOnError errorKey={state?.error ?? null}>
      <form action={action} className="flex flex-col gap-2.5 sm:gap-3">
        {!firstRun && (
          <label className="flex flex-col gap-1.5">
            {/* The owner-identity second factor. It must never hint a REAL address. */}
            <span className="text-[13px] font-medium text-[var(--st-ink)]">Email</span>
            <input id="signin-admin-identifier" name="identifier" autoComplete="username webauthn" className={FIELD} placeholder="you@company.com" />
          </label>
        )}
        <Password id="signin-admin-password" name="password" label={firstRun ? "Choose a password (at least 8 characters)" : "Password"} autoComplete={firstRun ? "new-password" : "current-password"} minLength={firstRun ? 8 : undefined} />
        {firstRun && <Password id="signin-admin-confirm" name="confirm" label="Type it again" autoComplete="new-password" />}
        {state?.error && <Err>{state.error}</Err>}
        <button type="submit" disabled={pending} className={cn(PRIMARY, "mt-1")}>
          {pending && <Loader2 size={16} className="animate-spin" />}{pending ? "One moment…" : firstRun ? "Set password and enter" : "Sign in"}
        </button>
      </form>
    </ShakeOnError>
  );
}

function Password({ id, name, label, autoComplete, minLength }: { id: string; name: string; label: string; autoComplete: string; minLength?: number }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-[var(--st-ink)]">{label}</span>
      <span className="relative">
        <input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength}
          className={cn(FIELD, "pr-12")} placeholder="••••••••"
          onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--st-muted)] hover:text-[var(--st-ink)]">
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      {caps && <span className="flex items-center gap-1.5 text-xs text-[var(--st-soon-text)]"><TriangleAlert size={12} />Caps Lock is on</span>}
    </label>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="m-0 rounded-[10px] bg-[var(--st-bad-wash)] px-3 py-2.5 text-[13px] text-[var(--st-late-text)]">{children}</p>;
}

function LogoTile({ size }: { size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]" style={{ width: size, height: size }}>
      <Image src="/logo-source.png" alt="Oracle Consultancy" width={size - 10} height={size - 10} className="object-contain" />
    </span>
  );
}

/* The desk's left half: the brand, a line on what COS is, and the Studio's own
   motif — a row of bars, one per open task on Home — drawn from a fixed pattern
   (nothing here is data: this screen is before anyone signs in). */
// The owner's words (25 Sept 2026).
const TAGLINE = "Built in-house, and the first in Tanzania — an advanced task management system for a group of companies.";

/** Phone and tablet: the same dark panel, sized to sit above the form. */
export function BrandCompact() {
  return (
    <div className="st-tex-rings relative overflow-hidden rounded-[22px] bg-[#141517] p-4 text-[#F2F2F0] sm:p-5 lg:hidden">
      <div className="flex items-center gap-2.5">
        <LogoTile size={36} />
        <div className="text-[15px] font-semibold leading-tight text-white">Oracle Consultancy Limited</div>
        <ThemeButton inline />
      </div>
      <div className="mt-3.5 text-[26px] font-medium leading-none tracking-[-0.03em] sm:mt-5 sm:text-[32px]">Task Management</div>
      {/* No tagline on a phone (owner, 25 Sept 2026) — tablet up keeps it. */}
      <p className="m-0 mt-3 hidden text-[13px] leading-relaxed text-white sm:block">{TAGLINE}</p>
      <div className="mt-3 flex h-[24px] items-end gap-[3px] sm:mt-4 sm:h-[34px]" aria-hidden>
        {BARS.map((h, i) => (
          <span key={i} className="st-rise block min-w-0 flex-1 rounded-[2px]" style={{ height: `${Math.round((h / 66) * 100)}%`, maxWidth: 7, background: BAR_C(i), animationDelay: `${i * 18}ms` }} />
        ))}
      </div>
    </div>
  );
}

const BARS = [34, 52, 40, 60, 46, 66, 38, 58, 44, 64, 50, 36, 62, 48, 56, 42, 66, 40, 54, 46, 60, 38, 52, 44, 58, 36, 62, 50, 46, 64, 42, 56, 40, 60, 48, 54];
const BAR_C = (i: number) => (i > 29 ? "#E0479E" : i > 26 ? "#F5A524" : i > 5 ? "#19C37D" : "#CFE05A");

export function BrandPanel() {
  return (
    <aside className="st-tex-rings relative hidden min-h-[560px] flex-col justify-between overflow-hidden rounded-[28px] bg-[#141517] p-10 text-[#F2F2F0] lg:flex">
      <div className="flex items-center gap-3">
        <LogoTile size={48} />
        <div className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-white">Oracle Consultancy Limited</div>
      </div>
      <div>
        <div className="text-[64px] font-medium leading-[0.95] tracking-[-0.04em]">Task<br />Management</div>
        <p className="m-0 mt-5 max-w-[40ch] text-[15px] leading-relaxed text-white">{TAGLINE}</p>
      </div>
      <div>
        <div className="flex h-[70px] items-end gap-[3px]" aria-hidden>
          {BARS.map((h, i) => (
            <span key={i} className="st-rise block w-[7px] rounded-[3px]" style={{ height: h, background: BAR_C(i), animationDelay: `${i * 18}ms` }} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-white">
          <span>Secure sign-in</span><span>© {new Date().getFullYear()} Oracle Consultancy</span>
        </div>
      </div>
    </aside>
  );
}

export function ThemeButton({ inline = false }: { inline?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={inline
        ? "ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#2E3035] text-[#C9CBCF] hover:text-white"
        : "fixed right-8 top-8 z-10 flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-ink)] hover:text-[var(--st-ink)]"}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
