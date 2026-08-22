import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, AlertTriangle, FileText } from "lucide-react";
import { getPortalPerson, personCanSeeCompany } from "@/lib/portal-auth";
import { portalCapabilities } from "@/lib/portal-capabilities";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sb } from "@/db/supabase";
import { HeroMetrics, Hero, Panel, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { CompanyAvatar } from "@/components/company-avatar";
import { getCompanyLogoUrl } from "@/lib/company-brand";
import { listCompanyDocuments } from "@/lib/portal-documents";
import { PortalDocumentsLibrary } from "@/components/portal-documents-library";

export const dynamic = "force-dynamic";

/** Portal company detail — a READ-ONLY, role-scoped company view (group-wide roles:
 *  any company; managers: their own). Operational only: headcount + open work. No
 *  financials. Gated by personCanSeeCompany. */
function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "muted" }) {
  return (
    <div className="rounded-2xl bg-bg-subtle/50 px-3 py-3 text-center ring-1 ring-border/40">
      <div className={`text-xl font-semibold tabular ${tone === "danger" && value > 0 ? "text-danger" : "text-fg"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-fg-muted">{label}</div>
    </div>
  );
}

/** Where "back" goes. You can reach a company from the board, the directory or a
 *  person's page, and the link used to always say "Board" — which threw you out
 *  of the directory you were browsing. Mirrors the admin side's `?from=` crumb. */
const BACK_TO: Record<string, { href: string; label: string }> = {
  directory: { href: "/portal/directory?tab=companies", label: "Companies" },
  team: { href: "/portal/team", label: "Team" },
  board: { href: "/portal/board", label: "Board" },
};

export default async function PortalCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const { from } = await searchParams;
  const back = BACK_TO[from ?? ""] ?? BACK_TO.board;
  const companyId = Number((await params).id);
  if (!Number.isFinite(companyId) || !(await personCanSeeCompany(me, companyId))) notFound();

  const [companyRes, headcountRes, tasksAll, logoUrl] = await Promise.all([
    sb.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
    sb.from("people").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
    getAllTasks(),
    getCompanyLogoUrl(companyId),
  ]);
  const company = companyRes.data as { id: number; name: string } | null;
  if (!company) notFound();

  const open = tasksAll
    .filter((t) => t.companyId === companyId && isOpen(t.status))
    .sort((a, b) => {
      const oa = a.flag === "overdue" || a.flag === "escalate-now" ? 0 : 1;
      const ob = b.flag === "overdue" || b.flag === "escalate-now" ? 0 : 1;
      return oa - ob;
    });
  const overdue = open.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length;
  const headcount = headcountRes.count ?? 0;

  // Documents for this company (its own + its people's) — management only; staff
  // don't get document access yet.
  const isManagement = portalCapabilities(me.portalRole).isManagement;
  const docs = isManagement ? await listCompanyDocuments(companyId) : [];

  return (
    <div className="space-y-4">
      <Link href={back.href} className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft size={14} /> {back.label}
      </Link>

      <Reveal>
        <Hero
          title={
            <span className="flex items-center gap-2.5">
              <CompanyAvatar name={company.name} logoUrl={logoUrl} size={28} rounded="rounded-md" iconSize={16} />
              {company.name}
            </span>
          }
          subtitle="Its people, its open work and its papers."
        >
          <HeroMetrics
            items={[
              { label: "headcount", value: headcount },
              { label: "open tasks", value: open.length },
              { label: "overdue", value: overdue, tone: "danger" },
            ]}
          />
        </Hero>
      </Reveal>

      <Reveal delay={0.06}>
        <Panel className="p-4">
          <SectionLabel icon={<ClipboardCheck size={13} />}>
            Open tasks
            {open.length > 0 && <span className="ml-1 text-fg-subtle/70">· {open.length}</span>}
          </SectionLabel>
          {open.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">No open tasks for this company.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {open.slice(0, 20).map((t) => {
                const od = t.flag === "overdue" || t.flag === "escalate-now";
                return (
                  <li key={t.id}>
                    <Link
                      href={`/portal/task/${t.code}`}
                      className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-subtle"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${od ? "bg-danger" : "bg-accent/70"}`} />
                      <span className="min-w-0 flex-1 truncate text-sm group-hover:text-accent">{t.actionItem}</span>
                      {od && <AlertTriangle size={13} className="shrink-0 text-danger" />}
                    </Link>
                  </li>
                );
              })}
              {open.length > 20 && <li className="pl-3.5 text-xs text-fg-subtle">+{open.length - 20} more</li>}
            </ul>
          )}
        </Panel>
      </Reveal>

      {/* Company documents — the same command-centre categories/rows, reflected
          here read-only. Management only. */}
      {isManagement && (
        <Reveal delay={0.1}>
          <div className="flex flex-col gap-2.5">
            <SectionLabel icon={<FileText size={13} />}>
              Documents{docs.length > 0 && <span className="ml-1 text-fg-subtle/70">· {docs.length}</span>}
            </SectionLabel>
            <PortalDocumentsLibrary docs={docs} />
          </div>
        </Reveal>
      )}
    </div>
  );
}
