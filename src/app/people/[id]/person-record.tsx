"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecordPage, RecordSidebarBlock, type RecordSection } from "@/components/record-page";
import { PersonForm, type Defaults as PersonFormDefaults } from "@/components/person-form";
import { DeletePersonDialog } from "@/components/delete-person-dialog";
import { LinkedNotesTab } from "@/components/linked-notes";
import { Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";

/* The person record, on the shared RecordPage shell — same header, tabs, field
 * grid, right sidebar and ordering as a task. That sameness IS the ERPNext
 * feeling; nothing here is bespoke to people except which fields it names. */

type P = {
  id: number;
  name: string;
  staffId: string | null;
  active: boolean;
  role: string | null;
  personType: string;
  companyId: number | null;
  companyName: string | null;
  department: string | null;
  managerId: number | null;
  managerName: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  startDate: string | null;
  probationEndDate: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  workSite: string | null;
  residence: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

/** A field value that says "—" when there's nothing, so the grid never has holes. */
function V({ children }: { children: ReactNode }) {
  return children ? <>{children}</> : <span className="text-fg-subtle">—</span>;
}

export function PersonRecord({
  person,
  workload,
  tasks,
  documents,
  reports,
  portal,
  contacts,
  editDefaults,
  lookups,
}: {
  person: P;
  workload: { open: number; overdue: number; documents: number; reports: number };
  tasks: Array<{ code: string; href: string; title: string; status: string; companyName: string | null; overdue: boolean }>;
  documents: Array<{ id: number; title: string; category: string | null; status: string }>;
  reports: Array<{ id: number; name: string; role: string | null; companyName: string | null; dotted: boolean }>;
  portal: { enabled: boolean; role: string; designation: string | null; lastLoginAt: string | null };
  contacts: ReactNode;
  /** Everything PersonForm needs to edit this person, prepared on the server. */
  editDefaults: PersonFormDefaults;
  lookups: {
    companies: Array<{ id: number; name: string }>;
    peopleList: Array<{ id: number; name: string; active: boolean }>;
    departments: string[];
    sites: string[];
    roles: string[];
  };
}) {
  const [tab, setTab] = useState("overview");
  const router = useRouter();
  const { toast } = useToast();

  const sections: RecordSection[] = [
    {
      id: "role",
      title: "Role",
      fields: [
        { label: "Job title", value: <V>{person.role}</V> },
        {
          label: "Company",
          value: (
            <V>
              {person.companyName && person.companyId ? (
                <Link href={`/companies/${person.companyId}`} className="text-accent hover:underline">
                  {person.companyName}
                </Link>
              ) : (
                person.companyName
              )}
            </V>
          ),
        },
        { label: "Department", value: <V>{person.department}</V> },
        {
          label: "Reports to",
          value: (
            <V>
              {person.managerName && person.managerId ? (
                <Link href={`/people/${person.managerId}`} className="text-accent hover:underline">
                  {person.managerName}
                </Link>
              ) : (
                person.managerName
              )}
            </V>
          ),
        },
        { label: "Started", value: <V>{fmt(person.startDate)}</V> },
        { label: "Probation ends", value: <V>{fmt(person.probationEndDate)}</V> },
      ],
    },
    {
      id: "contact",
      title: "Contact",
      fields: [
        { label: "Email", value: <V>{person.email}</V> },
        { label: "Phone", value: <V>{person.phone}</V> },
        { label: "WhatsApp", value: <V>{person.whatsapp}</V> },
        { label: "Work site", value: <V>{person.workSite}</V> },
        { label: "Lives at", value: <V>{person.residence}</V> },
        { label: "Address", value: <V>{person.address}</V>, full: true },
      ],
    },
    {
      id: "personal",
      title: "Personal",
      collapsible: true,
      defaultOpen: false,
      fields: [
        { label: "Date of birth", value: <V>{fmt(person.dateOfBirth)}</V> },
        { label: "Nationality", value: <V>{person.nationality}</V> },
        { label: "Emergency contact", value: <V>{person.emergencyContactName}</V> },
        { label: "Emergency phone", value: <V>{person.emergencyContactPhone}</V> },
        {
          label: "Notes",
          value: <V>{person.notes ? <span className="whitespace-pre-wrap">{person.notes}</span> : null}</V>,
          full: true,
        },
      ],
    },
  ];

  const sidebar = (
    <>
      <RecordSidebarBlock title="Workload">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Open tasks", value: workload.open, tone: "" },
            { label: "Overdue", value: workload.overdue, tone: workload.overdue > 0 ? "text-danger" : "" },
            { label: "Documents", value: workload.documents, tone: "" },
            { label: "Reports", value: workload.reports, tone: "" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-bg-subtle/50 px-2.5 py-2">
              <span className={cn("block text-lg font-semibold leading-none tabular", s.tone)}>{s.value}</span>
              <span className="mt-1 block text-[11px] text-fg-subtle">{s.label}</span>
            </div>
          ))}
        </div>
      </RecordSidebarBlock>

      <RecordSidebarBlock title="Staff portal">
        {portal.enabled ? (
          <>
            <p className="flex items-center gap-1.5 text-[12px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Enabled · {portal.role}
            </p>
            <p className="text-[11px] text-fg-subtle">
              {portal.lastLoginAt ? `Last signed in ${fmt(portal.lastLoginAt)}` : "Never signed in"}
            </p>
          </>
        ) : (
          <p className="text-[12px] text-fg-muted">No portal login. Turn one on in Settings.</p>
        )}
      </RecordSidebarBlock>

      <RecordSidebarBlock title="Danger zone">
        <p className="text-[12px] text-fg-muted">
          Deactivating keeps the record and is almost always what you want. Deleting is for a
          duplicate or a row created by mistake.
        </p>
        <DeletePersonDialog personId={person.id} personName={person.name} />
      </RecordSidebarBlock>

      {reports.length > 0 && (
        <RecordSidebarBlock title={`Direct reports · ${reports.length}`}>
          <ul className="space-y-1">
            {reports.map((r) => (
              <li key={`${r.id}-${r.dotted}`}>
                <Link href={`/people/${r.id}`} className="flex min-w-0 items-center gap-1.5 hover:text-accent">
                  <span className="truncate text-[12.5px]">{r.name}</span>
                  {r.dotted && <span className="shrink-0 text-[10px] text-fg-subtle">(also)</span>}
                </Link>
                {r.role && <span className="block truncate text-[11px] text-fg-subtle">{r.role}</span>}
              </li>
            ))}
          </ul>
        </RecordSidebarBlock>
      )}
    </>
  );

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "tasks", label: "Tasks", count: tasks.length },
    { id: "documents", label: "Documents", count: documents.length },
    // Notes that mention this person (Phase 3). No count: it would mean loading
    // every linked note to draw a tab nobody has opened.
    { id: "notes", label: "Notes" },
    { id: "edit", label: "Edit" },
  ];

  return (
    <RecordPage
      title={person.name}
      code={person.staffId ?? undefined}
      subtitle={[person.role, person.companyName].filter(Boolean).join(" · ") || undefined}
      status={
        person.active ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="default">Archived</Badge>
        )
      }
      actions={<div className="flex flex-wrap items-center gap-1.5">{contacts}</div>}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      sections={tab === "overview" ? sections : undefined}
      sidebar={tab === "overview" ? sidebar : undefined}
    >
      {/* Owner-only, like the whole module — this is the admin person page, not
          the portal, so a member of staff never sees the notes written about
          them. Loaded on demand: the tab is the only thing that asks. */}
      {tab === "notes" && (
        <LinkedNotesTab
          type="person"
          id={person.id}
          emptyHint={`Write @${person.name} in any note and it will appear here.`}
          about={{ entity: "person", id: person.id, label: person.name }}
        />
      )}

      {tab === "tasks" && (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
          {tasks.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-fg-muted">No open tasks.</p>
          ) : (
            <ul>
              {tasks.map((t) => (
                <li key={t.code} className="border-b border-border last:border-0">
                  {/* Code · title · company · status. Four things on one line is
                      fine on a desk and hopeless at 375px: the company and the
                      status are `shrink-0`, so the TITLE was the only thing that
                      could give — "TBS and B…", "Dormat Co…" — while "Furaha
                      Innovation Ltd" sat there in full. The title is what you
                      came to read, so on a phone it gets the first line to
                      itself and the company and status go underneath. */}
                  <Link href={t.href} data-list-row className="group flex items-center gap-2 px-3 hover:bg-bg-subtle max-sm:flex-col max-sm:items-stretch max-sm:gap-0.5 max-sm:py-2">
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <span className="shrink-0 text-[11px] tabular text-fg-subtle">{t.code}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] group-hover:text-accent">{t.title}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2 max-sm:pl-[3.4rem] sm:contents">
                      <span className="min-w-0 truncate text-[11px] text-fg-muted sm:shrink-0">{t.companyName}</span>
                      <span className={cn("shrink-0 text-[11px]", t.overdue ? "font-medium text-danger" : "text-fg-subtle")}>
                        {t.overdue ? "Overdue" : t.status}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "edit" && (
        <PersonForm
          mode="edit"
          id={person.id}
          defaults={editDefaults}
          companies={lookups.companies}
          peopleList={lookups.peopleList}
          departments={lookups.departments}
          sites={lookups.sites}
          roles={lookups.roles}
          onCancel={() => setTab("overview")}
          onComplete={(res) => {
            if (!res.ok) return;
            toast("Person updated.", { tone: "success" });
            setTab("overview");
            router.refresh();
          }}
        />
      )}

      {tab === "documents" && (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
          {documents.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-fg-muted">Nothing filed against this person.</p>
          ) : (
            <ul>
              {documents.map((d) => (
                <li key={d.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/documents?person=${person.id}`}
                    data-list-row
                    className="group flex items-center gap-2 px-3 hover:bg-bg-subtle"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] group-hover:text-accent">{d.title}</span>
                    <span className="shrink-0 text-[11px] text-fg-muted">{d.category}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px]",
                        d.status === "Expired" ? "font-medium text-danger" : d.status === "Expiring" ? "text-warn" : "text-fg-subtle"
                      )}
                    >
                      {d.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </RecordPage>
  );
}
