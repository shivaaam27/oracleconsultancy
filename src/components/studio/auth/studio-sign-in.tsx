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
import { PasskeyLoginButton, PASSKEY_USED_KEY } from "@/app/login/passkey-login-button";
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
  // A device that has signed in with a passkey gets that button first.
  const [passkeyFirst, setPasskeyFirst] = useState(false);
  useEffect(() => {
    try { setPasskeyFirst(window.localStorage.getItem(PASSKEY_USED_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  // On a computer the cursor waits in the first empty box (never on a phone,
  // where focusing throws the keyboard over the screen).
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const t = setTimeout(() => {
      const ids = as === "staff" ? ["signin-staff-identifier", "signin-staff-password"] : firstRun ? ["signin-admin-password"] : ["signin-admin-identifier", "signin-admin-password"];
      const el = ids.map((id) => document.getElementById(id) as HTMLInputElement | null).find((x) => x && !x.value) ?? null;
      el?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [as, firstRun]);
  const choose = (v: As) => {
    setAs(v);
    try { window.localStorage.setItem(AS_KEY, v); } catch { /* ignore */ }
  };

  return (
    <AuthFrame>
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
              {passkeyFirst && !(firstRun && as === "admin") && (
                <>
                  <PasskeyLoginButton studio />
                  <div className="flex items-center gap-3 text-xs text-[var(--st-ink)]" aria-hidden>
                    <span className="h-px flex-1 bg-[var(--st-line)]" />or use your password<span className="h-px flex-1 bg-[var(--st-line)]" />
                  </div>
                </>
              )}
              {as === "staff" ? <StaffForm /> : <AdminForm firstRun={firstRun} />}
              {!passkeyFirst && !(firstRun && as === "admin") && (
                <>
                  <div className="flex items-center gap-3 text-xs text-[var(--st-ink)]" aria-hidden>
                    <span className="h-px flex-1 bg-[var(--st-line)]" />or<span className="h-px flex-1 bg-[var(--st-line)]" />
                  </div>
                  <PasskeyLoginButton studio />
                </>
              )}
            </div>

            <p className="m-0 text-center text-xs leading-relaxed text-[var(--st-sub)] sm:text-[var(--st-ink)]">
              {as === "staff"
                ? "No access yet? Ask your administrator to switch the portal on for you."
                : firstRun ? "You can add Face ID or a fingerprint from Settings afterwards." : "Forgot it? Reset it from Settings on a device that is already signed in."}
            </p>
    </AuthFrame>
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

/**
 * The whole sign-in screen's frame (26 Sept 2026, owner: "make this full page,
 * add the footer, then merge it with the header"). On a desk: the dark brand
 * panel beside the form, as before. Below `lg`: ONE full-screen piece — the
 * dark header runs edge to edge under the status bar, and the white sheet with
 * the form rises over its foot on rounded corners and runs to the bottom of
 * the screen, where a small footer closes it. Used by /login, /portal/login and
 * the Claude consent screen (/mcp/connect).
 */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="studio fixed inset-0 z-[60] overflow-y-auto bg-[var(--st-page)] text-[var(--st-ink)] [font-family:var(--font-geist),var(--font-sans)] max-lg:bg-[#141517]">
      {/* Desk (26 Sept 2026, owner): ONE dark frame filling the window, the
          form on a card inside it on the left, the brand and the big bars on
          the right. Below lg the same tree is the phone's header + sheet. */}
      <div className="flex min-h-full lg:p-4 xl:p-5">
        <div className="relative flex min-h-full w-full flex-col lg:grid lg:min-h-[620px] lg:grid-cols-[minmax(440px,0.8fr)_minmax(0,1fr)] lg:overflow-hidden lg:rounded-[32px] lg:bg-[#141517] lg:p-3">
          <div aria-hidden className="st-tex-rings pointer-events-none absolute inset-0 hidden lg:block" />
          <BrandCompact />
          <div className="relative z-[1] -mt-7 flex flex-1 flex-col rounded-t-[28px] bg-[var(--st-surface)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-7 shadow-[0_-12px_32px_rgba(0,0,0,0.18)] sm:px-8 sm:pt-9 lg:mt-0 lg:rounded-[24px] lg:px-10 lg:pb-6 lg:pt-7 lg:shadow-none xl:px-14">
            {/* The card's own header on a desk: who you are signing in to. */}
            <div className="mb-2 hidden items-center gap-2.5 lg:flex">
              <LogoTile size={34} />
              <span className="text-[14px] font-semibold leading-tight">Oracle Consultancy Limited</span>
              <ThemeButton card />
            </div>
            <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-4 sm:gap-6 lg:max-w-[380px] lg:justify-center lg:py-10">
              {children}
            </div>
            <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-4 text-[11px] text-[var(--st-muted)]">
              <span>© {new Date().getFullYear()} Oracle Consultancy Limited</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck size={11} />Secure sign-in</span>
            </footer>
          </div>
          <BrandSide />
        </div>
      </div>
    </div>
  );
}

/** Below `lg`: the dark panel as a full-width header the sheet rises over. */
export function BrandCompact() {
  return (
    <div className="st-tex-rings relative overflow-hidden bg-[#141517] px-5 pb-14 pt-[max(24px,calc(env(safe-area-inset-top)+16px))] text-[#F2F2F0] sm:px-8 sm:pb-14 sm:pt-8 lg:hidden">
      <div className="flex items-center gap-2.5">
        <LogoTile size={36} />
        <div className="text-[15px] font-semibold leading-tight text-white">Oracle Consultancy Limited</div>
        <ThemeButton inline />
      </div>
      <div className="mt-6 text-[30px] font-medium leading-none tracking-[-0.03em] sm:mt-7 sm:text-[36px]">Task Management</div>
      {/* The tagline shows on a phone again (owner, 26 Sept 2026). */}
      <p className="m-0 mt-3 max-w-[46ch] text-[13px] leading-relaxed text-white/90">{TAGLINE}</p>
      <div className="mt-5 flex h-[34px] items-end gap-[3px] sm:mt-6 sm:h-[40px]" aria-hidden>
        {BARS.map((h, i) => (
          <span key={i} className="st-rise block min-w-0 flex-1 rounded-[2px]" style={{ height: `${Math.round((h / 66) * 100)}%`, maxWidth: 7, background: BAR_C(i), animationDelay: `${i * 18}ms` }} />
        ))}
      </div>
    </div>
  );
}

const BARS = [34, 52, 40, 60, 46, 66, 38, 58, 44, 64, 50, 36, 62, 48, 56, 42, 66, 40, 54, 46, 60, 38, 52, 44, 58, 36, 62, 50, 46, 64, 42, 56, 40, 60, 48, 54];
const BAR_C = (i: number) => (i > 29 ? "#E0479E" : i > 26 ? "#F5A524" : i > 5 ? "#19C37D" : "#CFE05A");

/** Desk: the right of the frame — the name, the line on what COS is, and the
 *  Studio's bars drawn large along the foot (a fixed pattern, not data). */
export function BrandSide() {
  return (
    <aside className="relative hidden min-w-0 flex-col px-12 pb-0 pt-12 text-[#F2F2F0] lg:flex xl:px-16 xl:pt-16">
      <div className="text-[64px] font-medium leading-[0.92] tracking-[-0.045em] xl:text-[88px]">Task<br />Management</div>
      <p className="m-0 mt-6 max-w-[44ch] text-[15px] leading-relaxed text-white/85 xl:text-[16px]">{TAGLINE}</p>
      <div className="mt-auto flex items-end justify-end pb-6 pt-10">
        <div className="max-w-[300px] text-right">
          <p className="m-0 text-[15px] leading-snug text-white">One place for every task, across every company.</p>
          <p className="m-0 mt-1.5 text-xs text-white/60">Oracle Consultancy Limited</p>
        </div>
      </div>
      <div className="flex h-[min(34vh,280px)] items-end gap-[5px] xl:gap-[7px]" aria-hidden>
        {BARS.map((h, i) => (
          <span key={i} className="st-rise block min-w-0 flex-1 rounded-t-[6px]" style={{ height: `${Math.round((h / 66) * 100)}%`, background: BAR_C(i), animationDelay: `${i * 22}ms` }} />
        ))}
      </div>
    </aside>
  );
}

export function ThemeButton({ inline = false, card = false }: { inline?: boolean; card?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={card
        ? "ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[var(--st-line)] text-[var(--st-ink)] hover:bg-[var(--st-page)]"
        : inline
        ? "ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#2E3035] text-[#C9CBCF] hover:text-white"
        : "fixed right-8 top-8 z-10 flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-ink)] hover:text-[var(--st-ink)]"}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
