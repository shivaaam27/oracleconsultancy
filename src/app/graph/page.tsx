import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, User, FileText, Hash } from "lucide-react";
import { getEntityGraph, type GraphNode } from "@/lib/entity-graph";
import { StudioScope, StudioCard, CardHead, stBtn } from "@/components/studio/kit";
import { BackLink } from "@/components/back-link";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connections · Oracle" };

const ICON: Record<GraphNode["kind"], React.ComponentType<{ size?: number; className?: string }>> = {
  company: Building2, person: User, document: FileText, fact: Hash,
};

/** Connections — who and what a company or person is tied to (shareholdings,
 *  directorships, filings, facts). Studio, 26 Sept 2026. Every node is a door. */
export default async function GraphPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const sp = await searchParams;
  const kind = sp.type === "person" ? "person" : "company";
  const id = parseInt(sp.id ?? "", 10);
  if (Number.isNaN(id)) return notFound();
  const graph = await getEntityGraph(kind, id);
  if (!graph) return notFound();
  const Center = kind === "person" ? User : Building2;
  const total = graph.groups.reduce((s, g) => s + g.nodes.length, 0);

  return (
    <StudioScope className="flex flex-col gap-5">
      <BackLink fallbackHref={kind === "person" ? `/people/${id}` : `/companies/${id}?tab=profile`} fallbackLabel={kind === "person" ? "Person" : "Company"} className={cn(stBtn.chip, "self-start")} />
      <StudioCard texture="rings" className="min-h-[170px]">
        <CardHead label="Connections" right={<span>{total} link{total === 1 ? "" : "s"} across {graph.groups.length} kind{graph.groups.length === 1 ? "" : "s"}</span>} />
        <div className="mt-auto flex items-end gap-4 pt-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--st-card-3)]"><Center size={24} /></span>
          <div className="min-w-0">
            <h1 className="m-0 truncate text-[32px] font-medium leading-tight tracking-[-0.03em]">{graph.center.label}</h1>
            {graph.center.sub && <div className="mt-1 text-[13px] text-[var(--st-on-card-muted)]">{graph.center.sub}</div>}
          </div>
        </div>
      </StudioCard>

      {graph.groups.length === 0 ? (
        <p className="m-0 rounded-[20px] bg-[var(--st-surface)] py-10 text-center text-[13px] text-[var(--st-muted)]">No connections recorded yet.</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 pb-10 lg:grid-cols-2">
          {graph.groups.map((g) => (
            <section key={g.title} className="rounded-[20px] bg-[var(--st-surface)] p-5">
              <div className="flex items-baseline justify-between"><h2 className="m-0 text-[15px] font-semibold">{g.title}</h2><span className="text-xs text-[var(--st-muted)]">{g.nodes.length}</span></div>
              <ul className="m-0 mt-2 flex list-none flex-col p-0">
                {g.nodes.map((n, i) => {
                  const I = ICON[n.kind];
                  const inner = (
                    <span className="flex items-center gap-3 rounded-[10px] px-2 py-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--st-page)] text-[var(--st-sub)]"><I size={15} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium">{n.label}</span>
                        {n.sub && <span className="block truncate text-xs text-[var(--st-muted)]">{n.sub}</span>}
                      </span>
                    </span>
                  );
                  return <li key={`${n.id}-${i}`}>{n.href ? <Link href={n.href} className="block rounded-[10px] transition-colors hover:bg-[var(--st-page)]">{inner}</Link> : inner}</li>;
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </StudioScope>
  );
}
