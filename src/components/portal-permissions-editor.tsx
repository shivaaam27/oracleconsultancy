"use client";

import { useMemo, useState } from "react";
import { Select } from "./ui";
import { Check, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  CAPABILITY_GROUPS,
  PORTAL_ROLES,
  ROLE_LABEL,
  SCOPE_LEVELS,
  DEFAULT_SCOPE,
  DEFAULT_CAPS,
  type PortalRoleKey,
  type CapabilityKey,
  type ScopeLevel,
} from "@/lib/portal-permissions";

/* Settings → Portals → Roles & permissions. A role × capability matrix plus a
 * per-role data-scope selector. Fully controlled; serialises the whole config to
 * one hidden JSON field the server action stores. Defaults mirror today, so the
 * "Reset to defaults" button returns to the built-in behaviour. */

type Matrix = {
  scope: Record<PortalRoleKey, ScopeLevel>;
  caps: Record<CapabilityKey, Record<PortalRoleKey, boolean>>;
};

export function PortalPermissionsEditor({
  initial,
  action,
}: {
  initial: Matrix;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [scope, setScope] = useState<Record<PortalRoleKey, ScopeLevel>>(initial.scope);
  const [caps, setCaps] = useState<Record<CapabilityKey, Record<PortalRoleKey, boolean>>>(initial.caps);

  const json = useMemo(() => JSON.stringify({ scope, caps }), [scope, caps]);

  const toggle = (key: CapabilityKey, role: PortalRoleKey) =>
    setCaps((c) => ({ ...c, [key]: { ...c[key], [role]: !c[key][role] } }));

  const reset = () => {
    setScope({ ...DEFAULT_SCOPE });
    setCaps(JSON.parse(JSON.stringify(DEFAULT_CAPS)));
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="config" value={json} />

      {/* Safety note */}
      <div className="flex items-start gap-2.5 rounded-xl bg-bg-subtle/60 px-3 py-2.5 text-sm text-fg-muted ring-1 ring-border">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" />
        <p>
          Two rules are always on and can&apos;t be switched off: a person can always manage a task they raised,
          and the Command Centre owner always has full access. Everything else is yours to set.
        </p>
      </div>

      {/* Data scope per role */}
      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Data visibility</p>
        <p className="text-xs text-fg-muted">Which companies&apos; tasks and records each role can see. Wider scope shows more of the group.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PORTAL_ROLES.map((role) => (
            <label key={role} className="flex items-center justify-between gap-3 rounded-xl bg-bg-elev px-3 py-2.5 ring-1 ring-border">
              <span className="text-base font-medium">{ROLE_LABEL[role]}</span>
              <Select
                value={scope[role]}
                onChange={(e) => setScope((s) => ({ ...s, [role]: e.target.value as ScopeLevel }))}
                className="text-sm text-fg"
              >
                {SCOPE_LEVELS.map((lvl) => (
                  <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                ))}
              </Select>
            </label>
          ))}
        </div>
      </section>

      {/* Capability matrix */}
      {CAPABILITY_GROUPS.map((group) => (
        <section key={group.id} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{group.label}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-separate border-spacing-y-1.5 text-left">
              <thead>
                <tr>
                  <th className="w-1/2" />
                  {PORTAL_ROLES.map((role) => (
                    <th key={role} className="px-1 pb-1 text-center text-xs font-medium text-fg-muted">{ROLE_LABEL[role]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.caps.map((cap) => (
                  <tr key={cap.key}>
                    <td className="pr-3 align-top">
                      <p className="text-base font-medium leading-tight">{cap.label}</p>
                      <p className="mt-0.5 text-xs leading-snug text-fg-subtle">{cap.desc}</p>
                    </td>
                    {PORTAL_ROLES.map((role) => {
                      const on = caps[cap.key][role];
                      return (
                        <td key={role} className="px-1 text-center align-middle">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={`${cap.label} — ${ROLE_LABEL[role]}`}
                            onClick={() => toggle(cap.key, role)}
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-lg ring-1 transition-colors",
                              on ? "bg-accent text-accent-fg ring-accent" : "bg-bg-elev text-transparent ring-border hover:ring-accent/40",
                            )}
                          >
                            <Check size={13} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg">
          <RotateCcw size={13} /> Reset to defaults
        </button>
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-base font-medium text-accent-fg transition-opacity hover:opacity-90">
          <Save size={13} /> Save permissions
        </button>
      </div>
    </form>
  );
}
