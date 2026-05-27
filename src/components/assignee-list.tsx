"use client";

import { PersonDrawerLink } from "./person-drawer-link";

/**
 * Renders a comma-separated list of assignee names where each name is a
 * PersonDrawerLink. Falls back to plain text for any name whose id we don't
 * have (defensive — shouldn't happen given how getAllTasks populates them).
 */
export function AssigneeList({
  names, ids, className,
}: {
  names: string[];
  ids: number[];
  className?: string;
}) {
  if (names.length === 0) return null;
  return (
    <span className={className}>
      {names.map((name, i) => (
        <span key={`${ids[i] ?? "x"}-${i}`}>
          {i > 0 && <span className="text-fg-subtle">, </span>}
          {ids[i] ? (
            <PersonDrawerLink
              id={ids[i]}
              name={name}
              className="hover:text-accent transition-colors"
            />
          ) : (
            <span>{name}</span>
          )}
        </span>
      ))}
    </span>
  );
}
