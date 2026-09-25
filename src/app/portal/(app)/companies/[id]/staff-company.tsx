/**
 * A company, for a member of STAFF (26 Sept 2026) — the owner's company
 * screen, "own work only": its details, its people, its open / late numbers,
 * and THEIR tasks there. No files, equipment, governance, filings, timeline,
 * notes or org tools — none of that data is read for them.
 */
import { notFound } from "next/navigation";
import type { PortalPerson } from "@/lib/portal/portal-auth";
import { personCanSeeCompany, visibleTaskIds } from "@/lib/portal/portal-auth";
import { sb } from "@/db/supabase";
import { getAllTasks, type TaskRow } from "@/lib/tasks/queries";
import { tasksOfCompany } from "@/lib/tasks/company-kpis";
import { getCompanyLogoUrl } from "@/lib/companies/company-brand";
import { getStaffIdMap } from "@/lib/people/staff-id";
import { StudioCompany, type CompanyTabKey } from "@/components/studio/companies/studio-company";
import { StudioCompanyProfile } from "@/components/studio/companies/company-profile";
import { StudioPathsProvider } from "@/components/studio/studio-paths";
import { StaffTaskList } from "@/components/studio/tasks/staff-task-list";

const RANK = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY);

export async function StaffCompanyPage({ me, companyId, tabParam }: { me: PortalPerson; companyId: number; tabParam?: string }) {
  if (!(await personCanSeeCompany(me, companyId))) notFound();
  const tab: CompanyTabKey = tabParam === "profile" || tabParam === "tasks" ? tabParam : "overview";
  const [{ data: co }, { data: primary }, { data: assoc }, all, ids, logo, staffIds] = await Promise.all([
    sb.from("companies").select("id,name,accent_color,code_prefix,file_prefix,legal_name,registration_no,tin,vrn,incorporation_date,address,phone,email,signatory_name,signatory_title").eq("id", companyId).maybeSingle(),
    sb.from("people").select("id,name,role").eq("company_id", companyId).eq("active", true).order("name"),
    sb.from("person_companies").select("person_id").eq("company_id", companyId),
    getAllTasks(),
    visibleTaskIds(me),
    getCompanyLogoUrl(companyId),
    getStaffIdMap(),
  ]);
  if (!co) notFound();
  const name = co.name as string;
  const isLate = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";
  const isOpen = (r: TaskRow) => r.status !== "Completed" && r.status !== "Closed";
  const companyOpen = tasksOfCompany(all, companyId).filter(isOpen);
  const mineSet = new Set(ids);
  const mine = all.filter((r) => r.companyId === companyId && mineSet.has(r.id));
  const myOpen = mine.filter(isOpen).sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || RANK(a.deadline) - RANK(b.deadline));
  const people = new Set<number>([...(primary ?? []).map((p) => p.id as number), ...(assoc ?? []).map((r) => r.person_id as number)]);
  const rank = (role: string | null) => (/director|ceo|chair/i.test(role ?? "") ? 0 : /head|manager|cfo|coo/i.test(role ?? "") ? 1 : 2);
  const eat = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "Africa/Nairobi" }).replace(",", "");

  const body =
    tab === "profile" ? (
      <StudioCompanyProfile
        companyId={companyId} companyName={name} accent={(co.accent_color as string | null) ?? null} logoUrl={logo}
        profile={{
          filePrefix: (co.file_prefix as string | null) ?? null, legalName: (co.legal_name as string | null) ?? null,
          registrationNo: (co.registration_no as string | null) ?? null, tin: (co.tin as string | null) ?? null, vrn: (co.vrn as string | null) ?? null,
          incorporationDate: co.incorporation_date ? new Date(co.incorporation_date as string).toISOString().slice(0, 10) : null,
          address: (co.address as string | null) ?? null, phone: (co.phone as string | null) ?? null, email: (co.email as string | null) ?? null,
          signatoryName: (co.signatory_name as string | null) ?? null, signatoryTitle: (co.signatory_title as string | null) ?? null, sectorRegulated: false,
        }}
        relationships={null} facts={null} governance={null} documents={null} readOnly
      />
    ) : tab === "tasks" ? (
      mine.length === 0
        ? <section className="rounded-[20px] bg-[var(--st-surface)] px-5 py-12 text-center text-[13px] text-[var(--st-muted)]">You have no tasks at {name}.</section>
        : <StaffTaskList rows={[...myOpen, ...mine.filter((r) => !isOpen(r))]} back={`/portal/companies/${companyId}?tab=tasks`} hideCompany />
    ) : null;

  return (
    <StudioPathsProvider staff>
      <StudioCompany data={{
        readOnly: true,
        id: companyId, name, prefix: ((co.code_prefix as string | null) ?? name.slice(0, 2)).toUpperCase(), logo,
        open: companyOpen.length, late: companyOpen.filter(isLate).length, people: people.size, tab,
        chips: { overdue: 0, dueSoon: 0, stalled: 0, noDeadline: 0, noOwner: 0 }, tf: "open", doneCount: 0,
        overview: tab !== "overview" ? null : {
          documents: { total: 0, expired: 0, expiring: 0 },
          tasks: myOpen.map((r) => {
            const days = r.deadline ? Math.floor((r.deadline.getTime() - Date.now()) / 86_400_000) : null;
            return {
              code: r.code, title: r.actionItem,
              when: !r.deadline ? "no date" : isLate(r) ? `${Math.max(1, -Math.ceil((r.deadline.getTime() - Date.now()) / 86_400_000))}d late` : eat(r.deadline),
              tone: !r.deadline ? "none" as const : isLate(r) ? "late" as const : days != null && days <= 6 ? "soon" as const : "plain" as const,
            };
          }),
          staff: (primary ?? []).map((p) => ({ id: p.id as number, name: p.name as string, role: (p.role as string | null) ?? null, staffId: staffIds.get(p.id as number) ?? null }))
            .sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name)),
          alsoCount: Math.max(0, people.size - (primary ?? []).length),
          equipment: { assets: 0, vendors: 0, expiredContracts: 0, items: [] },
          governance: { capTable: 0, signatories: 0, resolutions: 0, facts: 0 },
        },
      }}>
        {body}
      </StudioCompany>
    </StudioPathsProvider>
  );
}
