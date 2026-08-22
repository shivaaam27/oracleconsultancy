"use client";

import { useMemo, useState } from "react";
import { Download, Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import { MultiSelect } from "@/components/multi-select";
import type { BriefPersonRole } from "@/lib/brief-links";

/**
 * Director Brief filters on the portal profile, directly under the hero.
 *
 * Deliberately NOT a page: the choices live in local state and only assemble
 * the download link, so changing them never reloads the profile behind you.
 *
 * The lists handed in are already scoped to what this person may see
 * (portalBriefOptions), and the download route re-checks every value against
 * their scope — nothing here is trusted.
 */
export function PortalBriefFilters({
  months,
  companies,
  people,
}: {
  months: Array<{ value: string; label: string }>;
  companies: Array<{ id: number; name: string; accent: string | null }>;
  people: Array<{ id: number; name: string }>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [role, setRole] = useState<BriefPersonRole | null>(null);

  const href = useMemo(() => {
    const params = new URLSearchParams();
    params.set("period", picked.length ? `on:${[...picked].sort().join(",")}` : "month");
    if (companyIds.length) params.set("co", companyIds.join(","));
    if (personIds.length) {
      params.set("who", personIds.join(","));
      if (role) params.set("role", role);
    }
    return `/api/portal/brief-pdf?${params.toString()}`;
  }, [picked, companyIds, personIds, role]);

  // These are control TRIGGERS in a control row, so they take the control height
  // (h-9 / 6px radius — CONTROL_SHELL's shape), not the Button `sm` shape they
  // used to copy. h-8 was internally consistent but made this the only 32px row
  // in the portal, where every other field row is 36.
  const pill =
    "h-9 px-2.5 text-xs rounded-md font-medium border border-border bg-bg-elev text-fg hover:bg-bg-muted";

  return (
    <div className="rounded-2xl bg-bg-subtle/50 p-3 ring-1 ring-border/60">
      <div className="mb-2.5 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
        Director Brief
      </div>

      {/* One row on desktop; wraps to as many lines as the phone needs, with the
          controls still aligned because they share a height. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* All three use the SAME MultiSelect, so they read as one control
            repeated rather than three different widgets. */}
        <MultiSelect
          value={picked}
          options={months}
          onApply={setPicked}
          allLabel="This month"
          noun="months"
          className={pill}
        />

        {/* Company — only shown when they govern more than one. */}
        {companies.length > 1 && (
          <MultiSelect
            value={companyIds}
            options={companies.map((c) => ({ value: String(c.id), label: c.name, dot: c.accent || "hsl(var(--accent))" }))}
            onApply={setCompanyIds}
            allLabel="All companies"
            noun="companies"
            className={pill}
          />
        )}

        {people.length > 0 && (
          <MultiSelect
            value={personIds}
            options={people.map((p) => ({ value: String(p.id), label: p.name }))}
            onApply={(next) => {
              setPersonIds(next);
              if (next.length === 0) setRole(null);
            }}
            allLabel="Everyone"
            noun="people"
            className={pill}
          />
        )}

        {personIds.length > 0 &&
          (["lead", "working"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole((prev) => (prev === r ? null : r))}
              className={cn(
                "inline-flex items-center transition-colors",
                pill,
                role === r && "border-accent bg-accent text-accent-fg hover:bg-accent-hover"
              )}
            >
              {r === "lead" ? "Lead" : "Working"}
            </button>
          ))}

        {/* Actions share the row. Navigating to an `attachment` URL downloads in
            place — no blank tab, which is what works on iOS and in the installed
            app. Preview omits `download=1`, so the route sends the PDF inline
            and it OPENS in the viewer rather than saving. */}
        {/* Wears `pill`, exactly like Preview beside it. It used to be a
            `Button size="sm"`, which is a perfectly good kit size and still left
            it the only 32px control in a row of 36s. */}
        <button
          type="button"
          onClick={() => { window.location.href = `${href}&download=1`; }}
          className={cn("inline-flex items-center gap-1.5 transition-colors", pill)}
        >
          <Download size={14} /> Download PDF
        </button>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={cn("inline-flex items-center gap-1.5 transition-colors", pill)}
        >
          <Eye size={14} /> Preview
        </a>
      </div>
    </div>
  );
}
