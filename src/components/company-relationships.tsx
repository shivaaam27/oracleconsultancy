import { Users2 } from "lucide-react";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import type { CompanyRelationship } from "@/lib/relationships";

const ROLE_TONE: Record<string, string> = {
  Director: "bg-accent-soft/60 text-accent ring-accent/20",
  Shareholder: "bg-info-soft/60 text-info ring-info/20",
  "Company secretary": "bg-bg-subtle text-fg-muted ring-border/60",
  Signatory: "bg-bg-subtle text-fg-muted ring-border/60",
  "Beneficial owner": "bg-warn-soft/60 text-warn ring-warn/20",
};

/** People & parties tied to this company, inferred from its filings (directors,
 *  shareholders, secretary…). Read-only; matched people link to their record. */
export function CompanyRelationships({ relationships }: { relationships: CompanyRelationship[] }) {
  if (relationships.length === 0) return null;
  return (
    <section className="glass elevated rounded-2xl p-4 space-y-2.5">
      <h2 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
        <Users2 size={13} /> People in filings
        <span className="text-[10px] font-normal text-fg-subtle normal-case">inferred from documents</span>
      </h2>
      <ul className="divide-y divide-border/50">
        {relationships.map((r, i) => (
          <li key={`${r.role}-${r.personId ?? r.name}-${i}`} className="flex items-center gap-2.5 py-2">
            <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${ROLE_TONE[r.role] ?? "bg-bg-subtle text-fg-muted ring-border/60"}`}>
              {r.role}
            </span>
            <span className="min-w-0 flex-1">
              {r.personId ? (
                <PersonDrawerLink id={r.personId} name={r.name} className="text-sm font-medium hover:text-accent hover:underline transition-colors">
                  {r.name}
                </PersonDrawerLink>
              ) : (
                <span className="text-sm font-medium">{r.name}</span>
              )}
              {r.detail && <span className="ml-1.5 text-[11px] text-fg-subtle">{r.detail}</span>}
            </span>
            {!r.personId && <span className="shrink-0 text-[10px] text-fg-subtle">not on file</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
