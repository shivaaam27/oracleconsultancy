import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PersonPackPrintButton } from "@/components/person-pack-print-button";
import {
  getPersonPack,
  parsePersonPackSections,
  defaultPersonPackSelection,
  type PersonPackPurpose,
} from "@/lib/person-pack";

export const dynamic = "force-dynamic";

const PURPOSE_LABELS: Record<PersonPackPurpose, string> = {
  "document-request": "Document Request",
  "visa-permit": "Visa / Permit",
  recruitment: "Recruitment",
  "task-reminder": "Task Reminder",
  custom: "Custom",
};

const PURPOSES: PersonPackPurpose[] = ["document-request", "visa-permit", "recruitment", "task-reminder", "custom"];

function parsePurpose(value?: string): PersonPackPurpose {
  return PURPOSES.includes(value as PersonPackPurpose) ? (value as PersonPackPurpose) : "document-request";
}

function fmtDate(value: Date | string | null) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-section">
      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-fg-muted print:text-slate-600">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default async function PersonPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ purpose?: string; sections?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const personId = Number(id);
  if (!Number.isFinite(personId)) notFound();

  const purpose = parsePurpose(sp.purpose);
  const pack = await getPersonPack(personId, purpose);
  if (!pack) notFound();

  const selection = sp.sections
    ? parsePersonPackSections(sp.sections)
    : defaultPersonPackSelection(purpose, pack.detail.person.personType);
  const person = pack.detail.person;
  const generated = fmtDate(pack.generatedAt);

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 pb-28 pt-5 print:max-w-none print:px-0 print:pb-0">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-2">
        <Link href={`/people?person=${person.id}`} className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-accent">
          <ArrowLeft size={14} /> Back to person
        </Link>
        <PersonPackPrintButton />
      </div>

      <header className="rounded-3xl glass elevated p-5 print:rounded-none print:border-b print:border-slate-200 print:bg-white print:p-0 print:pb-4 print:shadow-none">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent print:text-slate-500">Oracle Consultancy</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight print:text-3xl">{person.name}</h1>
        <p className="mt-1 text-sm text-fg-muted print:text-slate-600">
          {PURPOSE_LABELS[purpose]} - prepared {generated}
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3 print:grid-cols-3">
          <div>
            <div className="text-xs text-fg-subtle print:text-slate-500">Role</div>
            <div className="font-medium">{person.role ?? "Not recorded"}</div>
          </div>
          <div>
            <div className="text-xs text-fg-subtle print:text-slate-500">Company</div>
            <div className="font-medium">{person.companyName ?? "Not recorded"}</div>
          </div>
          <div>
            <div className="text-xs text-fg-subtle print:text-slate-500">Type</div>
            <div className="font-medium capitalize">{person.personType}</div>
          </div>
        </div>
      </header>

      <div className="space-y-5 rounded-3xl bg-bg-elev p-5 ring-1 ring-border print:rounded-none print:bg-white print:p-0 print:ring-0">
        {selection.missingDocuments && (
          <Section title="Items needed from you">
            {pack.compliance.gaps.length ? (
              <ul className="space-y-1.5 text-sm">
                {pack.compliance.gaps.map((gap) => <li key={gap.id}>- {gap.label}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted print:text-slate-600">No missing required documents found.</p>
            )}
          </Section>
        )}

        {selection.documentIssues && (
          <Section title="Documents needing attention">
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
              <p className="text-sm text-fg-muted print:text-slate-600">No expired or expiring documents found.</p>
            )}
          </Section>
        )}

        {selection.openTasks && (
          <Section title="Open work">
            {pack.openTasks.length ? (
              <table className="report-table">
                <thead><tr><th>Item</th><th>Due</th><th>Priority</th></tr></thead>
                <tbody>
                  {pack.openTasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <div>{task.actionItem}</div>
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
              <p className="text-sm text-fg-muted print:text-slate-600">No open tasks assigned.</p>
            )}
          </Section>
        )}

        {selection.personalTodos && (
          <Section title="To-dos">
            {pack.personalTodos.length ? (
              <ul className="space-y-1.5 text-sm">
                {pack.personalTodos.map((todo) => (
                  <li key={todo.id}>
                    - {todo.title}
                    {selection.deadlines && todo.dueAt ? ` (${fmtDate(todo.dueAt)})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted print:text-slate-600">No open personal to-dos assigned.</p>
            )}
          </Section>
        )}

        {selection.contactDetails && (
          <Section title="Contact details on record">
            <div className="grid gap-2 text-sm sm:grid-cols-3 print:grid-cols-3">
              <div>Email: {person.email ?? "Not recorded"}</div>
              <div>WhatsApp: {person.whatsapp ?? "Not recorded"}</div>
              <div>Phone: {person.phone ?? "Not recorded"}</div>
            </div>
          </Section>
        )}

        {selection.complianceScore && (
          <Section title="Compliance status">
            <p className="text-sm">Score: {pack.compliance.score}% ({pack.compliance.status})</p>
          </Section>
        )}

        {selection.internalNotes && person.notes && (
          <Section title="Internal notes">
            <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
          </Section>
        )}
      </div>
    </main>
  );
}
