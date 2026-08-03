"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { MultiSelect } from "@/components/multi-select";
import { briefHref, type BriefPersonRole } from "@/lib/brief-links";
import type { BriefPeriod } from "@/lib/director-brief";

const ROLES: Array<{ value: BriefPersonRole; label: string }> = [
  { value: "lead", label: "Lead" },
  { value: "working", label: "Working" },
];

/**
 * The Brief's person filter — tick any number of people. The report shows the
 * UNION of their work (a task two of them share is counted once).
 *
 * Lists EVERY active person (see `peopleOptions`), including those holding no
 * tasks — "nothing assigned" is a legitimate thing to want to see. Archived
 * leavers are excluded.
 *
 * Once anyone is picked, two toggles narrow it further: Lead (they are
 * accountable) and Working (they are on it, but not the lead). Neither pressed
 * means both, so the plain person filter is unchanged. Pressing the active one
 * again clears it. They stay hidden without a person, where they'd mean nothing.
 */
export function BriefPersonFilter({
  period,
  selectedCompanyIds,
  selectedPersonIds,
  selectedPersonRole,
  people,
}: {
  period: BriefPeriod;
  selectedCompanyIds: number[];
  selectedPersonIds: number[];
  selectedPersonRole: BriefPersonRole | null;
  people: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();

  if (people.length === 0) return null;

  return (
    <>
      <MultiSelect
        value={selectedPersonIds.map(String)}
        options={people.map((p) => ({ value: String(p.id), label: p.name }))}
        allLabel="Everyone"
        noun="people"
        onApply={(next) =>
          router.push(
            briefHref(period, {
              companyIds: selectedCompanyIds,
              personIds: next.map(Number),
              personRole: selectedPersonRole,
            })
          )
        }
        className="h-8 px-2.5 text-xs font-medium"
      />
      {selectedPersonIds.length > 0 &&
        ROLES.map((r) => {
          const on = selectedPersonRole === r.value;
          return (
            <Link
              key={r.value}
              href={briefHref(period, {
                companyIds: selectedCompanyIds,
                personIds: selectedPersonIds,
                personRole: on ? null : r.value, // pressing the active one clears it
              })}
              aria-pressed={on}
              className={cn(
                "inline-flex h-8 items-center rounded-lg border border-border bg-bg-elev px-2.5 text-xs font-medium text-fg transition-colors hover:bg-bg-muted",
                on && "border-accent bg-accent text-accent-fg hover:bg-accent-hover"
              )}
            >
              {r.label}
            </Link>
          );
        })}
    </>
  );
}
