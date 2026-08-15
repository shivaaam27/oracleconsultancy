import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, User, FileText, Hash, ClipboardList, Network, ArrowLeft } from "lucide-react";
import { getEntityGraph, type GraphNode } from "@/lib/entity-graph";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connections · COS" };

const ICON: Record<GraphNode["kind"], React.ComponentType<{ size?: number; className?: string }>> = {
  company: Building2, person: User, document: FileText, fact: Hash, pipeline: ClipboardList,
};

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const sp = await searchParams;
  const kind = sp.type === "person" ? "person" : "company";
  const id = parseInt(sp.id ?? "", 10);
  if (Number.isNaN(id)) return notFound();
  const graph = await getEntityGraph(kind, id);
  if (!graph) return notFound();
  const Center = kind === "person" ? User : Building2;
  const backHref = kind === "person" ? "/people" : `/companies/${id}?tab=profile`;

  return (
    <div className="space-y-4">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent transition-colors">
        <ArrowLeft size={13} /> Back
      </Link>

      {/* Centre entity */}
      <div className="glass elevated rounded-2xl p-4 flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Center size={20} /></span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate">{graph.center.label}</h1>
          <p className="text-[11px] text-fg-subtle inline-flex items-center gap-1.5"><Network size={11} /> Connections{graph.center.sub ? ` · ${graph.center.sub}` : ""}</p>
        </div>
      </div>

      {graph.groups.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-fg-muted">No connections recorded yet.</p>
      ) : (
        graph.groups.map((g) => (
          <section key={g.title} className="glass elevated rounded-2xl p-4 space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted">{g.title}</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {g.nodes.map((n, i) => {
                const I = ICON[n.kind];
                const inner = (
                  <span className="flex items-center gap-2.5 rounded-xl ring-1 ring-border/60 bg-bg-elev/40 px-3 py-2 h-full">
                    <I size={15} className="shrink-0 text-fg-muted" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{n.label}</span>
                      {n.sub && <span className="block truncate text-[11px] text-fg-subtle">{n.sub}</span>}
                    </span>
                  </span>
                );
                return (
                  <li key={`${n.id}-${i}`}>
                    {n.href ? (
                      <Link href={n.href} className="block transition-transform hover:-translate-y-0.5">{inner}</Link>
                    ) : inner}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
