"use client";
/* Portal access, on the person's own profile (Studio Edit tab).
 *
 * The owner, 24 Sept 2026: portal access lived in Settings while the companies
 * that decide what somebody SEES lived on the person — two lists that looked
 * alike, and every change meant a trip to Settings. Now it sits right under
 * "Role & companies" and saves with it:
 *   - the level (or no access at all), and what that level sees — worded from
 *     the live permission matrix, the same SCOPE_WORDS Settings uses;
 *   - for a Director, ONE choice: every company, or only the companies they
 *     work for (the list above — never a second list);
 *   - a password when giving access, or to reset it; the portal title.
 * It writes through the people actions → lib/portal-access.ts, the one door. */
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { PORTAL_ROLES, ROLE_LABEL, SCOPE_WORDS, type PortalRoleKey, type ScopeLevel } from "@/lib/portal-permissions";
import {
  setPortalLevelWithReach, grantPortalAccessWithReach, revokePortalAccessQuick, setPortalDesignationQuick, enablePortalAccessQuick,
} from "@/app/people/actions";
import { cn } from "@/lib/cn";

export type Reach = "all" | "own" | "custom";
export type PortalDraft = { level: PortalRoleKey | "none"; reach: Reach; password: string; designation: string };

/** What the profile knows about their access today. */
export type PortalNow = {
  enabled: boolean;
  role: PortalRoleKey;
  designation: string | null;
  lastLoginAt: string | null;
  /** The director scope as stored. */
  directorCompanyIds: number[];
  /** Main company + "also works for", as saved. */
  companyIds: number[];
};

export function reachOf(now: PortalNow): Reach {
  if (!now.enabled || now.role !== "director" || now.directorCompanyIds.length === 0) return "all";
  const same = now.directorCompanyIds.length === now.companyIds.length && now.directorCompanyIds.every((c) => now.companyIds.includes(c));
  return same ? "own" : "custom";
}
export function draftFrom(now: PortalNow): PortalDraft {
  return { level: now.enabled ? now.role : "none", reach: reachOf(now), password: "", designation: now.designation ?? "" };
}

/** Apply the draft after the person has been saved. Order matters: the level
 *  (and a director's reach, worked out from the companies just saved), then a
 *  password, then the title. Returns the first failure. */
export async function applyPortalDraft(personId: number, now: PortalNow, d: PortalDraft): Promise<{ ok: boolean; error?: string }> {
  const reach = d.reach === "custom" ? null : d.reach;
  if (d.level === "none") {
    if (now.enabled) return revokePortalAccessQuick(personId);
    return { ok: true };
  }
  if (!now.enabled) {
    if (d.password.length < 8) return { ok: false, error: "to give portal access, set a password of at least 8 characters." };
    const r = await grantPortalAccessWithReach(personId, d.level, d.password, reach ?? "all");
    if (!r.ok) return r;
  } else {
    const levelChanged = d.level !== now.role;
    // A "custom" director scope (differs from their companies) is left exactly
    // as it is unless the level or the reach is changed on purpose.
    const reachChanged = d.level === "director" && reach != null && reach !== reachOf(now);
    if (levelChanged || reachChanged) {
      if (d.level === "director" && reach == null) {
        return { ok: false, error: "choose what this director sees — every company, or only theirs." };
      }
      const r = await setPortalLevelWithReach(personId, d.level, reach ?? "all");
      if (!r.ok) return r;
    }
    if (d.password) {
      if (d.password.length < 8) return { ok: false, error: "the new password must be at least 8 characters." };
      // A password reset must not move a director's reach: a scope that differs
      // from their companies ("custom") is handed back exactly as stored.
      const r = d.level === "director" && reach == null
        ? await enablePortalAccessQuick(personId, d.level, d.password, now.directorCompanyIds)
        : await grantPortalAccessWithReach(personId, d.level, d.password, d.level === "director" ? (reach ?? "all") : "all");
      if (!r.ok) return r;
    }
  }
  if (d.designation.trim() !== (now.designation ?? "").trim()) {
    const r = await setPortalDesignationQuick(personId, d.designation);
    if (!r.ok) return r;
  }
  return { ok: true };
}

const SEG = "flex h-8 items-center rounded-lg px-2.5 text-xs transition-colors";

export function PortalEditor({ now, draft, onChange, scope, companyNames, personName }: {
  now: PortalNow;
  draft: PortalDraft;
  onChange: (d: PortalDraft) => void;
  scope: Record<PortalRoleKey, ScopeLevel>;
  /** Names of the companies on record (main first), to say what "their companies" means. */
  companyNames: string[];
  personName: string;
}) {
  const [reveal, setReveal] = useState(false);
  const set = (p: Partial<PortalDraft>) => onChange({ ...draft, ...p });
  const lvl = draft.level;
  const first = personName.replace(/^(Mr|Ms|Mrs|Miss|Dr|Chef|Eng)\.? /i, "").split(" ")[0];
  const theirs = companyNames.length ? companyNames.join(", ") : "no company yet";
  const sees = lvl === "none" ? null
    : lvl === "director" ? (draft.reach === "own" ? `Sees ${theirs}.` : draft.reach === "custom" ? null : "Sees every company.")
      : scope[lvl] === "companies" ? `Sees ${theirs}.` : `Sees ${SCOPE_WORDS[scope[lvl]]}.`;
  const revoking = now.enabled && lvl === "none";
  const granting = !now.enabled && lvl !== "none";

  return (
    <section className="rounded-[20px] bg-[var(--st-surface)] px-[22px] py-5">
      <div className="mb-3 flex min-h-[26px] items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold">Portal access</h2>
        <span className="text-xs text-[var(--st-muted)]">
          {now.enabled ? (now.lastLoginAt ? `last signed in ${new Date(now.lastLoginAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "has never signed in") : "no sign-in yet"}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 text-xs text-[var(--st-label)]">Level</div>
          <div className="flex flex-wrap gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]">
            {(["none", ...PORTAL_ROLES] as const).map((r) => (
              <button key={r} type="button" aria-pressed={lvl === r} onClick={() => set({ level: r, reach: r === "director" && lvl !== "director" ? reachOf(now) : draft.reach })}
                className={cn(SEG, lvl === r ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                {r === "none" ? "No access" : ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          {sees && <p className="mt-1.5 text-xs text-[var(--st-sub)]">{sees}</p>}
          {revoking && <p className="mt-1.5 text-xs text-[var(--st-late-text)]">Saving will stop {first} signing in. Everything they created is kept.</p>}
        </div>

        {lvl === "director" && (
          <div>
            <div className="mb-1.5 text-xs text-[var(--st-label)]">As a director, sees</div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {([["all", "Every company", "The whole portfolio."], ["own", "Only their companies", theirs]] as const).map(([k, l, hint]) => (
                <button key={k} type="button" aria-pressed={draft.reach === k} onClick={() => set({ reach: k })}
                  className={cn("rounded-[12px] border px-3 py-2.5 text-left transition-colors",
                    draft.reach === k ? "border-[var(--st-ink)] bg-[var(--st-cal-busy)]" : "border-[var(--st-line)] hover:bg-[var(--st-page)]")}>
                  <span className="block text-[13px] font-medium">{l}</span>
                  <span className="block truncate text-[11px] text-[var(--st-muted)]" title={hint}>{hint}</span>
                </button>
              ))}
            </div>
            {draft.reach === "custom" && (
              <p className="mt-2 rounded-[10px] bg-[var(--st-warn-wash)] px-3 py-2 text-xs text-[var(--st-soon-text)]">
                Right now {first} sees a different set of companies from the ones on their record ({now.directorCompanyIds.length} set in the past). Pick one of the two above to line them up — nothing changes until you do.
              </p>
            )}
            {draft.reach === "own" && companyNames.length === 0 && (
              <p className="mt-2 text-xs text-[var(--st-late-text)]">Add their company under Role &amp; companies first.</p>
            )}
          </div>
        )}

        {lvl !== "none" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-[var(--st-label)]">{granting ? "Password" : "New password"} <span className="text-[var(--st-muted)]">{granting ? "(at least 8)" : "(leave blank to keep)"}</span></span>
              <span className="relative">
                <input type={reveal ? "text" : "password"} value={draft.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password"
                  placeholder={granting ? "Set their password" : "Only to reset it"}
                  className="h-9 w-full rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 pr-9 text-[13px] outline-none" />
                <button type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--st-muted)] hover:text-[var(--st-ink)]">{reveal ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </span>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-[var(--st-label)]">Title on the portal <span className="text-[var(--st-muted)]">(optional)</span></span>
              <input value={draft.designation} onChange={(e) => set({ designation: e.target.value })} placeholder={`e.g. ${lvl === "manager" ? "Group Admin Manager" : ROLE_LABEL[lvl]}`}
                className="h-9 w-full rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px] outline-none" />
            </label>
          </div>
        )}
      </div>
    </section>
  );
}
