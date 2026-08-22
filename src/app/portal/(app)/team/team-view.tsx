"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { Users, Search, X } from "lucide-react";
import { PersonCard, type TeamPerson } from "./person-card";

/** Team — Director / Manager / Admin. One merged list of people: identity +
 *  contact/reminder icons + profile on top, each person's open tasks below. */
export function TeamView({ people }: { people: TeamPerson[] }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  // Render the first slice only; "Show all" reveals the rest. Each PersonCard
  // renders that person's open tasks, so capping a big team avoids a heavy first
  // paint. Resets whenever the search changes.
  const TEAM_CAP = 50;
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setShowAll(false); }, [ql]);

  const shown = useMemo(
    () => (ql ? people.filter((p) => `${p.name} ${p.role ?? ""} ${p.company ?? ""}`.toLowerCase().includes(ql)) : people),
    [people, ql],
  );
  const visible = showAll ? shown : shown.slice(0, TEAM_CAP);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel icon={<Users size={13} />}>Team</SectionLabel>
        <span className="text-xs text-fg-muted">{people.length} people</span>
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-bg-elev px-3.5 py-2.5 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
        <Search size={16} className="shrink-0 text-fg-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, role or company…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-fg-muted"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <Panel className="p-6 text-center text-sm text-fg-muted">No matches.</Panel>
      ) : (
        <>
          {visible.map((p, i) => (
            <Reveal key={p.id} delay={Math.min(i * 0.015, 0.2)}>
              <PersonCard p={p} />
            </Reveal>
          ))}
          {!showAll && shown.length > TEAM_CAP && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full rounded-xl bg-bg-elev px-3.5 py-2.5 text-center text-sm font-medium text-accent ring-1 ring-border transition-colors hover:bg-bg-subtle/60"
            >
              Show all ({shown.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}
