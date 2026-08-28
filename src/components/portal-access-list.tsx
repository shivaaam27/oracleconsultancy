"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { DirectorScopePicker } from "@/components/director-scope-picker";
import { setPortalRole, revokePortalAccess } from "@/app/settings/actions";
import { PORTAL_ROLES, ROLE_LABEL, SCOPE_WORDS, type PortalRoleKey, type ScopeLevel } from "@/lib/portal-permissions";

/**
 * "People with access", grouped by the access level they hold.
 *
 * ⚠️ WHAT THIS FIXES, and it is the reason it exists: the old flat list put a
 * company dropdown on EVERY row reading "All companies" — for staff, managers
 * and receptionists too, where the server ignores it entirely. It is the
 * DIRECTOR scope and nothing else. So the screen told the owner that every
 * member of staff could see the whole portfolio, which is neither what the
 * portal does nor what he set.
 *
 * Now the picker appears only on a Director, and every other role states the
 * scope the portal actually enforces — read from the live permissions config
 * (`scope`), never hard-coded, so changing Manager to "All companies" in Roles &
 * permissions changes what this says.
 */

export type PortalAccessPerson = {
  id: number;
  name: string;
  lastLogin: string | null;
  role: PortalRoleKey;
  directorCompanyIds: number[];
};

/** Sentence-case the shared phrase for a heading. */
const sentence = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const scopeWords = (level: ScopeLevel): string => sentence(SCOPE_WORDS[level]);

/** The one-line description under each group heading. */
function roleSummary(role: PortalRoleKey, level: ScopeLevel): string {
  if (role === "director") {
    return level === "all"
      ? "The whole portfolio — unless you scope them to one or more companies below."
      : `${scopeWords(level)} — unless you scope them to one or more companies below.`;
  }
  if (role === "receptionist") return `${scopeWords(level)}. Cleaning log only — no tasks.`;
  if (role === "manager") return `${scopeWords(level)} — set by "Also works for" on their own record.`;
  if (role === "hr") return `${scopeWords(level)}.`;
  return `${scopeWords(level)}.`;
}

const ORDER: PortalRoleKey[] = ["director", "hr", "manager", "receptionist", "staff"];

export function PortalAccessList({
  people,
  companies,
  scope,
}: {
  people: PortalAccessPerson[];
  companies: { id: number; name: string }[];
  scope: Record<PortalRoleKey, ScopeLevel>;
}) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = needle ? people.filter((p) => p.name.toLowerCase().includes(needle)) : people;
    return ORDER.map((role) => ({ role, rows: shown.filter((p) => p.role === role) })).filter((g) => g.rows.length > 0);
  }, [people, q]);

  const total = people.length;
  const found = groups.reduce((a, g) => a + g.rows.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          {total} {total === 1 ? "person has" : "people have"} a portal sign-in.{" "}
          <Link href="/settings?section=portals#portal-permissions" className="text-accent hover:underline">
            What each level can do <ArrowRight size={11} className="inline -mt-0.5" />
          </Link>
        </p>
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a person…"
            aria-label="Find a person with portal access"
            className="h-8 w-52 rounded-md bg-bg-elev pl-7 pr-2.5 text-sm text-fg ring-1 ring-border focus:outline-none focus:ring-accent/50"
          />
        </div>
      </div>

      {found === 0 && <p className="text-sm text-fg-subtle">Nobody matches &ldquo;{q}&rdquo;.</p>}

      {groups.map(({ role, rows }) => (
        <div key={role} className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
            <h4 className="text-sm font-semibold">
              {ROLE_LABEL[role]}
              <span className="ml-1.5 text-xs font-normal text-fg-subtle">({rows.length})</span>
            </h4>
            <p className="text-xs text-fg-muted">{roleSummary(role, scope[role])}</p>
          </div>
          {rows.map((p) => (
            // ⚠️ Keyed on the SERVER's values, not just the id: a save (or a
            // failed one) re-renders this page, and without the role/scope in
            // the key the row would keep showing whatever was last picked
            // rather than what is actually stored.
            <AccessRow
              key={`${p.id}:${p.role}:${p.directorCompanyIds.join(",")}`}
              person={p}
              companies={companies}
              scope={scope}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function AccessRow({
  person,
  companies,
  scope,
}: {
  person: PortalAccessPerson;
  companies: { id: number; name: string }[];
  scope: Record<PortalRoleKey, ScopeLevel>;
}) {
  // The role being EDITED right now — so the director scope picker appears the
  // moment you choose Director, before you press Save.
  const [role, setRole] = useState<PortalRoleKey>(person.role);

  return (
    /* ⚠️ TWO FIXED LINES, not one wrapping one. The settings card is ~525px even
       on a 1000px screen, so a single flex-wrap row wrapped differently per
       person — measured at 52, 77 and 84px tall with the Save buttons landing at
       six different x positions, because the name grows and the scope text
       varies from "2 companies" to "The companies on their record". Name and
       last sign-in on top; the controls below, with the scope taking the slack
       so Save and Revoke line up down the whole list. */
    <div className="rounded-xl bg-bg-subtle/60 px-3 py-2.5 ring-1 ring-border">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/people?person=${person.id}`} className="min-w-0 truncate text-sm font-medium hover:text-accent hover:underline">
          {person.name}
        </Link>
        <span className="shrink-0 text-xs text-fg-subtle">
          {person.lastLogin
            ? `Last in ${new Date(person.lastLogin).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : "Never signed in"}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {/* Change the level without resetting the password. */}
        <form action={setPortalRole} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="personId" value={person.id} />
          <Select
            name="portalRole"
            value={role}
            onChange={(e) => setRole(e.target.value as PortalRoleKey)}
            size="sm"
            aria-label={`Access level for ${person.name}`}
            wrapperClassName="w-[7.5rem] shrink-0"
          >
            {PORTAL_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </Select>
          {/* A company scope is a DIRECTOR thing only — the server ignores it for
              every other role, so showing it there would be a lie on the screen. */}
          {role === "director" ? (
            <DirectorScopePicker companies={companies} selected={person.directorCompanyIds} className="min-w-0 flex-1" fill />
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle" title="Set by their level, not here">
              {scopeWords(scope[role])}
            </span>
          )}
          <Button type="submit" variant="secondary" size="sm" className="ml-auto shrink-0">Save</Button>
        </form>
        <form action={revokePortalAccess} className="shrink-0">
          <input type="hidden" name="personId" value={person.id} />
          <button type="submit" className="text-xs font-medium text-danger hover:underline">Revoke</button>
        </form>
      </div>
    </div>
  );
}
