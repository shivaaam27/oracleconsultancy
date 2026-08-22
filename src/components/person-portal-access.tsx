"use client";

import { useState } from "react";
import { Shield, ShieldOff, User, Users, Briefcase, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { useToast } from "./toast";
import { setPortalRoleQuick, enablePortalAccessQuick, revokePortalAccessQuick, setPortalDesignationQuick } from "@/app/people/actions";

type QuickRole = "staff" | "manager" | "director";
const ROLES: { value: QuickRole; label: string; icon: typeof User }[] = [
  { value: "staff", label: "Staff", icon: User },
  { value: "manager", label: "Manager", icon: Users },
  { value: "director", label: "Director", icon: Briefcase },
];

/* Manage staff-portal access for one person straight from the People drawer —
 * an instant Staff/Manager/Director toggle when access exists, an enable form
 * when it doesn't, plus reset-password / revoke. The every-company "Admin" role
 * stays in Settings on purpose. Mirrors the Settings flow via the *Quick
 * server actions (which revalidate /people). */
export function PersonPortalAccess({
  personId,
  portal,
  onChanged,
  fmtDate,
}: {
  personId: number;
  portal: { enabled: boolean; role: string; designation: string | null; lastLoginAt: string | null };
  onChanged: () => void;
  fmtDate: (d: Date) => string;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [showEnable, setShowEnable] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [pw, setPw] = useState("");
  const [pwRole, setPwRole] = useState<QuickRole>("staff");
  const [reveal, setReveal] = useState(false);
  const [designation, setDesignation] = useState(portal.designation ?? "");
  const [savingDesig, setSavingDesig] = useState(false);

  async function saveDesignation() {
    if (savingDesig || designation.trim() === (portal.designation ?? "").trim()) return;
    setSavingDesig(true);
    const res = await setPortalDesignationQuick(personId, designation);
    setSavingDesig(false);
    if (res.ok) { toast(designation.trim() ? "Designation saved." : "Designation cleared.", { tone: "success" }); onChanged(); }
    else toast(res.error, { tone: "danger" });
  }

  const role: QuickRole = portal.role === "manager" ? "manager" : portal.role === "director" ? "director" : "staff";
  // "hr"/admin isn't one of the quick toggle options — show it but don't let the
  // toggle silently downgrade it; switching requires Settings.
  const isAdmin = portal.role === "hr";

  async function changeRole(next: QuickRole) {
    if (next === role || pending) return;
    setPending(true);
    const res = await setPortalRoleQuick(personId, next);
    setPending(false);
    if (res.ok) { toast(`Role set to ${next}.`, { tone: "success" }); onChanged(); }
    else toast(res.error, { tone: "danger" });
  }

  async function enable() {
    if (pending) return;
    if (pw.length < 8) { toast("Password must be at least 8 characters.", { tone: "warn" }); return; }
    setPending(true);
    const res = await enablePortalAccessQuick(personId, pwRole, pw);
    setPending(false);
    if (res.ok) { toast("Portal access enabled.", { tone: "success" }); setPw(""); setShowEnable(false); onChanged(); }
    else toast(res.error, { tone: "danger" });
  }

  async function resetPassword() {
    if (pending) return;
    if (pw.length < 8) { toast("Password must be at least 8 characters.", { tone: "warn" }); return; }
    setPending(true);
    const res = await enablePortalAccessQuick(personId, role, pw);
    setPending(false);
    if (res.ok) { toast("Password reset.", { tone: "success" }); setPw(""); setShowReset(false); onChanged(); }
    else toast(res.error, { tone: "danger" });
  }

  async function revoke() {
    if (pending) return;
    setPending(true);
    const res = await revokePortalAccessQuick(personId);
    setPending(false);
    if (res.ok) { toast("Portal access revoked.", { tone: "success" }); onChanged(); }
    else toast(res.error, { tone: "danger" });
  }

  const pwField = (placeholder: string) => (
    <div className="relative flex-1 min-w-[8rem]">
      <input
        type={reveal ? "text" : "password"}
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        minLength={8}
        placeholder={placeholder}
        autoComplete="new-password"
        disabled={pending}
        className="w-full h-9 rounded-lg border border-border bg-bg-subtle px-3 pr-9 py-1.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
      />
      <button type="button" onClick={() => setReveal((s) => !s)} aria-label={reveal ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg">
        {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-subtle">
          {portal.enabled ? <Shield size={12} /> : <ShieldOff size={12} />} Portal access
        </span>
        <span className={cn("inline-flex items-center gap-1.5 text-xs", portal.enabled ? "text-success" : "text-fg-subtle")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", portal.enabled ? "bg-success" : "bg-fg-subtle/50")} />
          {portal.enabled ? "Active" : "Not set up"}
        </span>
      </div>

      {portal.enabled ? (
        <>
          {isAdmin ? (
            <p className="text-xs text-fg-muted">
              This person has the <span className="font-medium">Admin</span> (every-company) role — change it in Settings.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-bg-subtle/70 p-1">
              {ROLES.map(({ value, label, icon: Icon }) => {
                const on = value === role;
                return (
                  <button key={value} type="button" onClick={() => changeRole(value)} disabled={pending}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs transition-colors disabled:opacity-50",
                      on ? "bg-bg-elev text-accent ring-1 ring-accent/50 font-medium" : "text-fg-muted hover:bg-bg-muted/60",
                    )}>
                    <Icon size={15} /> {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Optional display designation — overrides the role label in the portal
              header + role badge (e.g. a manager shown as "Group Admin Manager"). */}
          <div className="flex items-center gap-2">
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              onBlur={saveDesignation}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveDesignation(); } }}
              maxLength={60}
              placeholder="Designation (optional, e.g. Group Admin Manager)"
              disabled={pending || savingDesig}
              className="flex-1 h-9 rounded-lg border border-border bg-bg-subtle px-3 py-1.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
            />
          </div>

          {showReset ? (
            <div className="flex items-center gap-2">
              {pwField("New password")}
              <Button type="button" size="sm" onClick={resetPassword} disabled={pending}>Save</Button>
              <button type="button" onClick={() => { setShowReset(false); setPw(""); }} className="text-xs text-fg-subtle hover:text-fg">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-xs text-fg-subtle">
                {portal.lastLoginAt ? `Last in ${fmtDate(new Date(portal.lastLoginAt))}` : "Never signed in"}
              </span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => { setShowReset(true); setShowEnable(false); }} className="text-xs text-accent hover:underline">Reset password</button>
                <button type="button" onClick={revoke} disabled={pending} className="text-xs text-danger hover:underline disabled:opacity-50">Revoke</button>
              </div>
            </div>
          )}
        </>
      ) : showEnable ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-bg-subtle/70 p-1">
            {ROLES.map(({ value, label, icon: Icon }) => {
              const on = value === pwRole;
              return (
                <button key={value} type="button" onClick={() => setPwRole(value)} disabled={pending}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs transition-colors disabled:opacity-50",
                    on ? "bg-bg-elev text-accent ring-1 ring-accent/50 font-medium" : "text-fg-muted hover:bg-bg-muted/60",
                  )}>
                  <Icon size={15} /> {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {pwField("Set a password")}
            <Button type="button" size="sm" onClick={enable} disabled={pending}>Enable</Button>
            <button type="button" onClick={() => { setShowEnable(false); setPw(""); }} className="text-xs text-fg-subtle hover:text-fg">Cancel</button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowEnable(true)}>
          <Shield size={13} /> Enable access
        </Button>
      )}
    </div>
  );
}
