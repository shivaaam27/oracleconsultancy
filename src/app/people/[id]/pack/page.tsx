import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileText,
  FileWarning,
  ShieldCheck,
} from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui";
import { PersonPackPrintButton } from "@/components/person-pack-print-button";
import {
  getPersonPack,
  parsePersonPackSections,
  defaultPersonPackSelection,
  type PersonPackDocument,
  type PersonPackPurpose,
} from "@/lib/person-pack";
import type { PersonPackSectionSelection } from "@/lib/person-pack-shared";
import { isPersonPackPurpose } from "@/lib/person-pack-shared";
import { personTypeLabel } from "@/lib/person-types";
import { BRAND_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

const PURPOSE_LABELS: Record<PersonPackPurpose, string> = {
  "document-request": "Document Request",
  "expat-onboarding": "Expat Onboarding",
  "visa-permit": "Visa / Permit",
  "work-permit-renewal": "Work Permit Renewal",
  recruitment: "Recruitment File",
  "contract-signing": "Contract Signing",
  "task-reminder": "Task Reminder",
  custom: "Custom",
};

function parsePurpose(value?: string): PersonPackPurpose {
  return isPersonPackPurpose(value) ? value : "document-request";
}

function fmtDate(value: Date | string | null) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function categoryForRequirement(label: string) {
  const l = label.toLowerCase();
  if (l.includes("passport")) return "Passport";
  if (l.includes("permit") || l.includes("visa") || l.includes("immigration")) return "Immigration";
  if (l.includes("contract") || l.includes("engagement")) return "Contract";
  return undefined;
}

function addDocumentHref(personId: number, label: string) {
  const params = new URLSearchParams({ newdoc: "1", person: String(personId), title: label, from: `person:${personId}` });
  const category = categoryForRequirement(label);
  if (category) params.set("category", category);
  return `/documents?${params.toString()}`;
}

function addPersonDocumentHref(personId: number) {
  return `/documents?${new URLSearchParams({ newdoc: "1", person: String(personId), from: `person:${personId}` }).toString()}`;
}

function statusTone(status: PersonPackDocument["status"]): "default" | "success" | "warn" | "danger" {
  if (status === "Expired") return "danger";
  if (status === "Expiring") return "warn";
  if (status === "Valid") return "success";
  return "default";
}

function complianceTone(status: "Good" | "Watch" | "Risk"): "default" | "success" | "warn" | "danger" {
  if (status === "Risk") return "danger";
  if (status === "Watch") return "warn";
  return "success";
}

function documentFileLabel(doc: PersonPackDocument) {
  if (doc.fileUrl) return "External link";
  if (doc.fileName) return doc.fileName;
  return null;
}

function DocumentFileCell({ doc }: { doc: PersonPackDocument }) {
  if (doc.fileUrl) {
    return (
      <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="print:text-slate-700 text-accent hover:underline">
        Open link
      </a>
    );
  }
  return documentFileLabel(doc) ?? "-";
}

function complianceText(pack: Awaited<ReturnType<typeof getPersonPack>> extends infer T ? NonNullable<T> : never) {
  const c = pack.compliance;
  if (c.required === 0 && c.monitoredDocuments === 0) {
    return "No required checklist applies yet, and no person-linked documents are on file.";
  }
  if (c.required === 0) {
    return `${plural(c.monitoredDocuments, "linked document")} monitored for expiry. Score ${c.score}% (${c.status}).`;
  }
  return `${c.present} of ${c.required} required items are present. Score ${c.score}% (${c.status}).`;
}

function actionCount(pack: Awaited<ReturnType<typeof getPersonPack>> extends infer T ? NonNullable<T> : never, selection: PersonPackSectionSelection) {
  return (
    (selection.missingDocuments ? pack.compliance.gaps.length : 0) +
    (selection.documentIssues ? pack.compliance.documentIssues.length : 0) +
    (selection.openTasks ? pack.openTasks.length : 0) +
    (selection.personalTodos ? pack.personalTodos.length : 0)
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="person-pack-section">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted print:text-slate-600">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function purposeIntro(purpose: PersonPackPurpose, name: string) {
  if (purpose === "expat-onboarding") {
    return `This pack summarises the onboarding, immigration and HR file items currently relevant to ${name}.`;
  }
  if (purpose === "visa-permit") {
    return `This pack summarises the immigration, permit and HR follow-up items currently relevant to ${name}.`;
  }
  if (purpose === "work-permit-renewal") {
    return `This pack summarises the permit renewal items, linked documents and open follow-up work currently relevant to ${name}.`;
  }
  if (purpose === "recruitment") {
    return `This pack summarises the recruitment and onboarding items currently relevant to ${name}.`;
  }
  if (purpose === "contract-signing") {
    return `This pack summarises the contract and signing details currently relevant to ${name}.`;
  }
  if (purpose === "task-reminder") {
    return `This pack summarises the open work and follow-up items currently assigned to ${name}.`;
  }
  if (purpose === "custom") {
    return `This pack summarises the selected person-specific items currently relevant to ${name}.`;
  }
  return `This pack summarises the selected document items currently relevant to ${name}.`;
}

export default async function PersonPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ purpose?: string; sections?: string; exclude?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const personId = Number(id);
  if (!Number.isFinite(personId)) notFound();

  const purpose = parsePurpose(sp.purpose);
  const pack = await getPersonPack(personId, purpose);
  if (!pack) notFound();

  // Drop the request items the operator unticked in the builder, so the PDF
  // shows exactly what was selected (and the counts/tiles match).
  if (sp.exclude) {
    try {
      const labels: string[] = JSON.parse(decodeURIComponent(atob(sp.exclude)));
      const excluded = new Set(labels.map((l) => l.trim().toLowerCase()));
      pack.compliance = {
        ...pack.compliance,
        gaps: pack.compliance.gaps.filter((g) => !excluded.has(g.label.trim().toLowerCase())),
      };
    } catch {
      /* malformed param — show the full list rather than failing the print */
    }
  }

  const selection = sp.sections
    ? parsePersonPackSections(sp.sections)
    : defaultPersonPackSelection(purpose, pack.detail.person.personType);
  const person = pack.detail.person;
  const generated = fmtDate(pack.generatedAt);
  const selectedActions = actionCount(pack, selection);
  const linkedDocsShown = selection.linkedDocuments ? pack.documents.length : 0;
  const workShown =
    (selection.openTasks ? pack.openTasks.length : 0) +
    (selection.personalTodos ? pack.personalTodos.length : 0);
  const headlineParts = [
    `${plural(selectedActions, "selected action")}`,
    selection.linkedDocuments ? `${plural(linkedDocsShown, "linked document")}` : null,
    workShown ? `${plural(workShown, "work item")}` : null,
    selection.complianceScore ? complianceText(pack) : null,
  ].filter(Boolean);

  // Only show the summary tiles that correspond to chosen sections, so a
  // documents-only pack never displays empty Work/Compliance boxes.
  const showActions = selection.missingDocuments || selection.documentIssues || selection.openTasks || selection.personalTodos;
  const showWork = selection.openTasks || selection.personalTodos;
  const complianceValue =
    pack.compliance.required === 0 && pack.compliance.monitoredDocuments === 0
      ? "None"
      : `${pack.compliance.score}%`;
  const statBoxes: Array<{ label: string; value: number | string; tone?: "warn" | "success" | "default" | "danger"; icon: React.ReactNode }> = [
    ...(showActions ? [{ label: "Needed", value: selectedActions, tone: (selectedActions ? "warn" : "success") as "warn" | "success", icon: selectedActions ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} /> }] : []),
    ...(selection.linkedDocuments ? [{ label: "Documents", value: linkedDocsShown, icon: <FileText size={16} /> }] : []),
    ...(showWork ? [{ label: "Work", value: workShown, tone: (workShown ? "warn" : "default") as "warn" | "default", icon: <ClipboardList size={16} /> }] : []),
    ...(selection.complianceScore ? [{ label: "Compliance", value: complianceValue, tone: complianceTone(pack.compliance.status), icon: <ShieldCheck size={16} /> }] : []),
  ];
  const statGridCols =
    statBoxes.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : statBoxes.length === 3 ? "grid-cols-3" : statBoxes.length === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-28 pt-5 print:max-w-none print:px-0 print:pb-0">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-2">
        <Link href={`/people?person=${person.id}`} className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-accent">
          <ArrowLeft size={14} /> Back to person
        </Link>
        <PersonPackPrintButton />
      </div>

      <div className="border-b border-border/70 pb-3 text-center print:border-slate-300">
        <div className="text-base font-semibold tracking-wide print:text-slate-900">{BRAND_NAME}</div>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-accent print:text-slate-500">
            Person Pack
          </div>
          <h1 className="text-xl font-semibold tracking-tight print:text-2xl">{person.name}</h1>
          <div className="mt-0.5 text-xs text-fg-muted print:text-slate-600">
            {PURPOSE_LABELS[purpose]} - prepared {generated}
          </div>
        </div>
        <Badge tone={person.personType === "expat" ? "warn" : "default"}>
          {personTypeLabel(person.personType)}
        </Badge>
      </header>

      <p className="text-sm leading-relaxed text-fg-muted print:text-slate-700">
        <b className={selectedActions ? "text-warn print:text-slate-900" : "text-success print:text-slate-900"}>
          {headlineParts[0]}
        </b>
        {headlineParts.length > 1 ? ` - ${headlineParts.slice(1).join(" - ")}` : ""}
      </p>

      <p className="print-only text-sm leading-relaxed">
        {purposeIntro(purpose, person.name)}
        {selectedActions > 0
          ? ` ${plural(selectedActions, "item")} require attention.`
          : " No selected action items currently require attention."}
      </p>

      {statBoxes.length > 0 && (
        <div className={`grid gap-3 ${statGridCols}`}>
          {statBoxes.map((box) => (
            <Stat key={box.label} label={box.label} value={box.value} tone={box.tone} icon={box.icon} />
          ))}
        </div>
      )}

      <Card className="p-4">
        <p className="text-sm leading-relaxed text-fg-muted print:text-slate-700">
          {selectedActions > 0
            ? "Please review the selected items below and send the requested documents or updates when available."
            : "No selected items currently require action. This pack can be kept as a clean person-specific record of the current status."}
        </p>
      </Card>

      <div className="space-y-5">
        {selection.missingDocuments && (
          <Section title="Items needed from you" icon={<FileWarning size={13} className="text-warn" />}>
            {pack.compliance.gaps.length ? (
              <Card className="divide-y divide-border/70">
                {pack.compliance.gaps.map((gap) => (
                  <div key={gap.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">{gap.label}</span>
                    <Link href={addDocumentHref(person.id, gap.label)} className="print-hidden rounded-md bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20">
                      Add document
                    </Link>
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="p-4 text-sm text-fg-muted">
                {pack.compliance.required === 0
                  ? "No required checklist applies to this person type yet."
                  : "No missing required documents found."}
              </Card>
            )}
          </Section>
        )}

        {selection.documentIssues && (
          <Section title="Documents needing attention" icon={<FileWarning size={13} className="text-warn" />}>
            {pack.compliance.documentIssues.length ? (
              <table className="report-table">
                <thead><tr><th>Document</th><th>Status</th><th>Expiry</th></tr></thead>
                <tbody>
                  {pack.compliance.documentIssues.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.title}</td>
                      <td>{doc.status}</td>
                      <td>{doc.expiryLabel ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Card className="p-4 text-sm text-fg-muted">No expired or expiring documents found.</Card>
            )}
          </Section>
        )}

        {selection.linkedDocuments && (
          <Section title="Linked documents on file" icon={<FileText size={13} className="text-accent" />}>
            {pack.documents.length ? (
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ width: "32%" }}>Document</th>
                    <th style={{ width: "16%" }}>Category</th>
                    <th style={{ width: "14%" }}>Status</th>
                    <th style={{ width: "18%" }}>Expiry</th>
                    {selection.fileLinks && <th>File</th>}
                  </tr>
                </thead>
                <tbody>
                  {pack.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.title}</td>
                      <td>{doc.category ?? "-"}</td>
                      <td><Badge tone={statusTone(doc.status)}>{doc.status}</Badge></td>
                      <td>{doc.expiryLabel ?? fmtDate(doc.expiryDate) ?? "-"}</td>
                      {selection.fileLinks && <td><DocumentFileCell doc={doc} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Card className="p-4 text-sm text-fg-muted">
                No person-linked documents are on file yet.
                <Link href={addPersonDocumentHref(person.id)} className="print-hidden ml-2 text-accent hover:underline">
                  Add document
                </Link>
              </Card>
            )}
          </Section>
        )}

        {selection.openTasks && (
          <Section title="Open work" icon={<ClipboardList size={13} className="text-info" />}>
            {pack.openTasks.length ? (
              <table className="report-table">
                <thead><tr><th>Task</th><th>Due</th><th>Priority</th></tr></thead>
                <tbody>
                  {pack.openTasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <div>{task.code} - {task.actionItem}</div>
                        {selection.latestUpdates && task.latestUpdate && (
                          <div className="mt-1 text-xs text-fg-muted print:text-slate-500">{task.latestUpdate}</div>
                        )}
                      </td>
                      <td>{selection.deadlines ? fmtDate(task.deadline) ?? "-" : "-"}</td>
                      <td>{task.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Card className="p-4 text-sm text-fg-muted">No open tasks assigned.</Card>
            )}
          </Section>
        )}

        {selection.personalTodos && (
          <Section title="To-dos" icon={<CheckCircle2 size={13} className="text-success" />}>
            {pack.personalTodos.length ? (
              <Card className="divide-y divide-border/70">
                {pack.personalTodos.map((todo) => (
                  <div key={todo.id} className="px-4 py-2.5 text-sm">
                    {todo.title}
                    {selection.deadlines && todo.dueAt ? <span className="text-fg-muted"> ({fmtDate(todo.dueAt)})</span> : null}
                    {todo.taskCode ? <span className="text-fg-subtle"> - {todo.taskCode}</span> : null}
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="p-4 text-sm text-fg-muted">No open personal to-dos assigned.</Card>
            )}
          </Section>
        )}

        {selection.contactDetails && (
          <Section title="Contact details on record">
            <Card className="grid gap-2 p-4 text-center text-sm sm:grid-cols-3 print:grid-cols-3">
              <div>Email: {person.email ?? "Not recorded"}</div>
              <div>WhatsApp: {person.whatsapp ?? "Not recorded"}</div>
              <div>Phone: {person.phone ?? "Not recorded"}</div>
            </Card>
          </Section>
        )}

        {selection.companyContext && (
          <Section title="Company context">
            <Card className="p-4 text-sm">
              <div>Primary company: {person.companyName ?? "Not recorded"}</div>
              <div>Role: {person.role ?? "Not recorded"}</div>
              {person.associations.length > 0 && (
                <div className="mt-2 text-fg-muted">
                  Also linked to: {person.associations.map((a) => [a.companyName, a.relationship].filter(Boolean).join(" - ")).join(", ")}
                </div>
              )}
            </Card>
          </Section>
        )}

        {selection.complianceScore && (
          <Section title="Compliance status" icon={<ShieldCheck size={13} className="text-accent" />}>
            <Card className="p-4 text-sm text-fg-muted">{complianceText(pack)}</Card>
          </Section>
        )}

        {selection.internalNotes && person.notes && (
          <Section title="Internal notes">
            <Card className="p-4">
              <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
            </Card>
          </Section>
        )}
      </div>
    </main>
  );
}
