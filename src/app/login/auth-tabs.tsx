"use client";

import { useState } from "react";
import { UserRound, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { AdminLoginForm } from "./login-form";
import { LoginForm as StaffLoginForm } from "@/app/portal/login/login-form";
import { PasskeyLoginButton } from "./passkey-login-button";

/** The sign-in card: a Team Portal / Administrator tab switcher so the team
 *  (staff, managers, HR, directors) and the owner sign in from one screen.
 *  Team Portal is the default. */
export function AuthTabs({ firstRun }: { firstRun: boolean }) {
  const [tab, setTab] = useState<"staff" | "admin">("staff");
  const tabCls = (active: boolean) =>
    cn("relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition-colors",
      active ? "text-accent-fg" : "text-fg-muted hover:text-fg");

  return (
    <div className="flex flex-col gap-5">
      {/* Segmented switch with a sliding indicator. */}
      <div className="relative grid grid-cols-2 gap-1 rounded-2xl bg-bg-subtle/70 ring-1 ring-border p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-accent shadow-sm transition-transform duration-300 ease-out"
          style={{ transform: tab === "admin" ? "translateX(calc(100% + 0.25rem))" : "translateX(0)" }}
        />
        <button type="button" onClick={() => setTab("staff")} className={tabCls(tab === "staff")} aria-pressed={tab === "staff"}>
          <UserRound size={15} /> Team Portal
        </button>
        <button type="button" onClick={() => setTab("admin")} className={tabCls(tab === "admin")} aria-pressed={tab === "admin"}>
          <ShieldCheck size={15} /> Administrator
        </button>
      </div>

      {tab === "staff" ? (
        <div className="flex flex-col gap-3">
          <StaffLoginForm />
          <p className="text-center text-xs text-fg-subtle">No access yet? Ask your administrator to enable the portal for you.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AdminLoginForm firstRun={firstRun} />
          {!firstRun && (
            <p className="text-center text-xs text-fg-subtle">Forgot it? Reset the password from Settings on a device that&apos;s already signed in.</p>
          )}
        </div>
      )}

      <PasskeyLoginButton />
    </div>
  );
}
