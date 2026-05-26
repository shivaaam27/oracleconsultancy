import { getAllTasks } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { PageHeader, TableShell, Th, Td, Badge, LinkButton } from "@/components/ui";
import { CompanySummary } from "@/components/company-summary";
import { Deadline } from "@/components/deadline";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  if (f === "closed") return "default";
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "warn";
  if (f === "on-track") return "success";
  return "default";
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = parseInt(id, 10);
  const rows = (await getAllTasks()).filter((r) => r.companyId === companyId);
  if (!rows.length) return notFound();
  const name = rows[0].companyName;
  return (
    <div className="space-y-4">
      <div>
        <Link href="/companies" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={12} /> All companies
        </Link>
      </div>
      <PageHeader
        title={name}
        sub={`${rows.length} tasks`}
        action={
          <LinkButton href={`/task/new?companyId=${companyId}`}>
            <Plus size={14} /> New Task
          </LinkButton>
        }
      />
      <CompanySummary companyId={companyId} />
      <TableShell>
        <table className="w-full">
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Action Item</Th>
              <Th>Accountable</Th>
              <Th>Deadline</Th>
              <Th>Status</Th>
              <Th>Priority</Th>
              <Th>Flag</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-bg-subtle transition-colors">
                <Td className="font-mono text-xs text-fg-muted">
                  <Link href={`/task/${r.code}`} className="hover:text-accent">{r.code}</Link>
                </Td>
                <Td><Link href={`/task/${r.code}`} className="hover:text-accent">{r.actionItem}</Link></Td>
                <Td className="text-fg-muted">{r.assignees.join(", ")}</Td>
                <Td className="whitespace-nowrap"><Deadline date={r.deadline} /></Td>
                <Td className="whitespace-nowrap">{r.status}</Td>
                <Td className="whitespace-nowrap">{r.priority}</Td>
                <Td><Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
