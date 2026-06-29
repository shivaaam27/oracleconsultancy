"use client";

import { PersonDrawerLink } from "./person-drawer-link";
import { cn } from "@/lib/cn";
import { getInitials as initials } from "@/lib/names";

/**
 * Calm, overlapping initials avatars for a task's assignees — replaces the
 * comma-separated name text that truncated badly ("Shivam Alpeshkumar |…").
 * Each avatar links to the person drawer and shows the hover preview; extras
 * past `max` roll into a quiet "+N" chip. Uniform tint keeps it Aurora-calm.
 */
export function AssigneeAvatars({
  names,
  ids,
  max = 3,
  size = 24,
  className,
}: {
  names: string[];
  ids: number[];
  max?: number;
  /** Diameter in px (24 desktop rows · 26 mobile cards). */
  size?: number;
  className?: string;
}) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;

  const base =
    "relative inline-flex items-center justify-center rounded-full ring-2 ring-bg-elev " +
    "font-semibold leading-none select-none transition-colors";
  const dims = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  return (
    <span
      className={cn("inline-flex items-center -space-x-1.5", className)}
      aria-label={`Assignees: ${names.join(", ")}`}
    >
      {shown.map((name, i) =>
        ids[i] ? (
          <PersonDrawerLink
            key={`${ids[i]}-${i}`}
            id={ids[i]}
            name={name}
            title={name}
            className={cn(base, "bg-bg-subtle text-fg-muted hover:bg-accent-soft hover:text-accent hover:ring-accent/30 hover:z-10")}
          >
            <span style={dims} className="inline-flex items-center justify-center">{initials(name)}</span>
          </PersonDrawerLink>
        ) : (
          <span key={`x-${i}`} title={name} className={cn(base, "bg-bg-subtle text-fg-muted")} style={dims}>
            {initials(name)}
          </span>
        ),
      )}
      {extra > 0 && (
        <span
          title={names.slice(max).join(", ")}
          className={cn(base, "bg-bg-muted text-fg-subtle")}
          style={dims}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
