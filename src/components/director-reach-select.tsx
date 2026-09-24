"use client";
/* A Director's reach in a Settings form — the same ONE choice the person's
 * profile offers (studio/people/portal-editor.tsx): every company, or only the
 * companies on their record. It posts `directorReach` = all | own | keep, and
 * the server works the company list out from the record (settings/actions.ts,
 * resolveDirectorScope). "keep" appears only when their stored scope differs
 * from their companies, so a save never quietly changes that. It replaced the
 * separate company picker that made a second company list (24 Sept 2026). */
import { useState } from "react";
import { FluidSelect } from "@/components/fluid-select";

export type ReachNow = "all" | "own" | "custom";

export function DirectorReachSelect({ current, theirs, className, forGrant = false }: {
  /** The Settings grant form, which doubles as a password RESET: it defaults to
   *  "keep", or resetting a scoped director's password made them portfolio-wide. */
  forGrant?: boolean;
  current: ReachNow;
  /** Their companies, in words — or blank when not known yet (a new grant). */
  theirs?: string;
  className?: string;
}) {
  const [v, setV] = useState<string>(forGrant || current === "custom" ? "keep" : current);
  const options = forGrant ? [
    { value: "keep", label: "As it is now — every company for someone new" },
    { value: "all", label: "Every company" },
    { value: "own", label: "Their companies (from their record)" },
  ] : [
    { value: "all", label: "Every company" },
    { value: "own", label: theirs ? `Their companies — ${theirs}` : "Their companies (from their record)" },
    ...(current === "custom" ? [{ value: "keep", label: "Keep their current list (differs from their record)" }] : []),
  ];
  return (
    <div className={className}>
      <input type="hidden" name="directorReach" value={v} />
      <FluidSelect value={v} onSelect={setV} options={options} buttonClassName="h-8 w-full rounded-md border border-border bg-bg-elev px-2.5 text-xs" />
    </div>
  );
}
