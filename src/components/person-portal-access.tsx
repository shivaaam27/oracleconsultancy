"use client";

import { useState } from "react";
import Link from "next/link";
import { Shield, ShieldOff, Eye, EyeOff, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Select } from "./ui";
import { DirectorScopePicker } from "./director-scope-picker";
import { useToast } from "./toast";
import { setPortalRoleQuick, enablePortalAccessQuick, revokePortalAccessQuick, setPortalDesignationQuick } from "@/app/people/actions";
import { PORTAL_ROLES, ROLE_LABEL, SCOPE_WORDS, type PortalRoleKey, type ScopeLevel } from "@/lib/portal-permissions";

/* Manage staff-portal access for one person straight from the People drawer.
 *
 * ⚠️ IT OFFERS THE SAME FIVE LEVELS AS SETTINGS, and writes through the same
 * door (`lib/portal-access.ts`). It used to offer three — Staff / Manager /
 * Director — with Admin and Receptionist reachable only in Settings, and it
 * could not scope a Director to companies at all. So the same person's access
 * looked different depending on which screen you happened to open, and a
 * Director set here was silently portfolio-wide.
 */

export function PersonPortalAccess({
  personId,
  portal,
  companies,
  scope,
  onChanged,
  fmtDate,
}: {
  personId: number;
  portal: { enabled: boolean; role: string; designation: string | null; lastLoginAt: string | null; directorCompanyIds: number[] };
  /** Active companies, for scoping a Director. */
  companies: { id: number; name: string }[];
  /** The live scope level per role, so this says what the portal enforces. */
  scope: Record<PortalRoleKey, ScopeLevel>;
  onChanged: () => void;
  fmtDate: (d: Date) => string;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [showEnable, setShowEnable] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [pw, setPw] = useState("");
  const [reveal, setReveal] = useState(false);
  const [designation, setDesignation] = useState(portal.designation ?? "");
  const [savingDesig, setSavingDesig] = useState(false);

  const current: PortalRoleKey = (PORTAL_ROLES as string[]).includes(portal.role) ? (portal.role as PortalRoleKey) : "staff";
  // The level being chosen right now (not yet saved for a new grant).
  const [role, setRole] = useState<PortalRoleKey>(current);
  const [scopeIds, setScopeIds] = useState<number[]>(portal.directorCompanyIds);

  async function saveDesignation() {
    if (savingDesig || designation.trim() === (portal.designation ?? "").trim()) return;
    setSavingDesig(true);
    const res = await setPortalDesignationQuick(personId, designation);
    setSavingDesig(false);
    if (res.ok) { toast(designation.trim() ? "Designation saved." : "Designation cleared.", { tone: "success" }); onChanged(); }
    else toast(res.error, { tone: "danger" });
  }

  /** Save the level AND, for a Director, the companies — in ONE action.
   *
   *  ⚠️ It is deliberately a button, not an instant toggle. Saving on each click
   *  would write "Director, all companies" the moment you picked Director and
   *  then narrow it a click later, so there is a moment where somebody can see
   *  the whole portfolio. Nothing is written until this is pressed. */
  async function saveRole() {
    if (pending) return;
    setPending(true);
    const res = await setPortalRoleQuick(personId, role, role === "director" ? scopeIds : []);
    setPending(false);
    if (res.ok) {
      // Match what was actually stored: a non-director carries no scope, so the
      // picker must not still be holding the companies they had as a director.
      setScopeIds(role === "director" ? scopeIds : []);
      toast(`Access level set to ${ROLE_LABEL[role]}.`, { tone: "success" });
      onChanged();
    }
    else { setRole(current); setScopeIds(portal.directorCompanyIds); toast(res.error, { tone: "danger" }); }
  }

  const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
  const dirty = role !== current || (role === "director" && !sameIds(scopeIds, portal.directorCompanyIds));

  async function enable() {
    if (pending) return;
    if (pw.length < 8) { toast("Password must be at least 8 characters.", { tone: "warn" }); return; }
    setPending(true);
    const res = await enablePortalAccessQuick(personId, role, pw, role === "director" ? scopeIds : []);
    setPending(false);
    if (res.ok) { toast("Portal access enabled.", { tone: "success" }); setPw(""); setShowEnable(false); onChanged(); }
    else toast(res.error, { tone: "danger" });
  }

  async function resetPassword() {
    if (pending) return;
    if (pw.length < 8) { toast("Password must be at least 8 characters.", { tone: "warn" }); return; }
    setPending(true);
    // Their level and scope are left exactly as they are — this only changes the
    // password (the core also refuses to demote on a reset).
    const res = await enablePortalAccessQuick(personId, current, pw, portal.directorCompanyIds);
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

  /** The level chooser + what that level SEES. Shared by the enable form and
   *  the live control, so a new grant and a change read identically. */
  const levelRow = (withSave: boolean) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as PortalRoleKey)}
          disabled={pending}
          aria-label="Access level"
          wrapperClassName="flex-1"
        >
          {PORTAL_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </Select>
        {role === "director" && (
          <DirectorScopePicker companies={companies} selected={scopeIds} onChange={setScopeIds} />
        )}
        {withSave && dirty && (
          <Button type="button" size="sm" onClick={saveRole} disabled={pending}>Save</Button>
        )}
      </div>
      <p className="text-xs text-fg-subtle">
        {role === "director"
          ? scopeIds.length === 0
            ? "Sees the whole portfolio. Pick companies to scope them to just those."
            : `Scoped to ${scopeIds.length} ${scopeIds.length === 1 ? "company" : "companies"}.`
          : `Sees ${SCOPE_WORDS[scope[role]]}.`}
        {role === "manager" && " Their companies are the ones under “Also works for” on this record."}
      </p>
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
          {levelRow(true)}

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
          {levelRow(false)}
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

      <Link
        href="/settings?section=portals#portal-permissions"
        className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-accent"
      >
        What each level can do <ArrowRight size={11} />
      </Link>
    </div>
  );
}
