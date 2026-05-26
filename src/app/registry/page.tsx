import { getAllTasks } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { PageHeader, TableShell, Th, Td, Badge, LinkButton, Card, EmptyState } from "@/components/ui";
import { Deadline } from "@/components/deadline";
import Link from "next/link";
import { Plus, RotateCcw, ListFilter, Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  switch (f) {
    case "closed": return "default";
    case "escalated":
    case "escalate-now":
    case "overdue":
    case "stalled": return "danger";
    case "due-soon":
    case "no-deadline":
    case "aging": return "warn";
    case "on-track": return "success";
    default: return "default";
  }
}

function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ company?: string; status?: string; flag?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await getAllTasks();

  let filtered = rows;
  if (sp.company) filtered = filtered.filter((r) => r.companyName === sp.company);
  if (sp.status) filtered = filtered.filter((r) => r.status === sp.status);
  if (sp.flag) filtered = filtered.filter((r) => r.flag === sp.flag);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.actionItem.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.assignees.some((a) => a.toLowerCase().includes(q))
    );
  }

  const companies = [...new Set(rows.map((r) => r.companyName))].sort();
  const statuses = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
  const flags = ["on-track", "due-soon", "overdue", "escalate-now", "escalated", "no-deadline", "stalled", "aging", "closed"];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Master Registry"
        sub={`${filtered.length} of ${rows.length} tasks`}
        action={
          <LinkButton href="/task/new">
            <Plus size={14} /> New Task
          </LinkButton>
        }
      />

      <Card className="p-3">
        <form className="flex flex-wrap gap-2 items-center">
          <input
            name="q"
            defaultValue={sp.q || ""}
            placeholder="Search action item, code, or person…"
            className="flex-1 min-w-[240px] px-3 py-1.5 text-sm rounded-md"
          />
          <select name="company" defaultValue={sp.company || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select name="status" defaultValue={sp.status || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select name="flag" defaultValue={sp.flag || ""} className="px-3 py-1.5 text-sm rounded-md">
            <option value="">All Flags</option>
            {flags.map((f) => <option key={f} value={f}>{flagLabel[f as keyof typeof flagLabel]}</option>)}
          </select>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90">
            <ListFilter size={14} /> Filter
          </button>
          <Link href="/registry" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">
            <RotateCcw size={13} /> Reset
          </Link>
        </form>
      </Card>

      <TableShell>
        {filtered.length === 0 ? (
          <EmptyState icon={<Inbox size={32} />} title="No tasks match your filters." hint="Try clearing them or creating a new task." />
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Company</Th>
                <Th>Department</Th>
                <Th>Action Item</Th>
                <Th>Accountable</Th>
                <Th>Deadline</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th align="right">Open</Th>
                <Th align="right">DTD</Th>
                <Th>Flag</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-bg-subtle transition-colors group">
                  <Td className="font-mono text-xs text-fg-muted">
                    <Link href={`/task/${r.code}`} className="group-hover:text-accent">{r.code}</Link>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: r.companyAccent || "transparent" }}
                      />
                      {r.companyName}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">{r.department || ""}</Td>
                  <Td className="max-w-md">
                    <Link href={`/task/${r.code}`} className="hover:text-accent">{r.actionItem}</Link>
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">{r.assignees.join(", ")}</Td>
                  <Td className="whitespace-nowrap"><Deadline date={r.deadline} /></Td>
                  <Td className="whitespace-nowrap"><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
                  <Td className="whitespace-nowrap"><Badge tone={priorityTone(r.priority)}>{r.priority}</Badge></Td>
                  <Td align="right" className="text-fg-muted">{r.daysOpen ?? ""}</Td>
                  <Td align="right" className={typeof r.daysToDeadline === "number" && r.daysToDeadline < 0 ? "text-danger font-medium" : "text-fg-muted"}>
                    {r.daysToDeadline === "done" ? "✓" : r.daysToDeadline ?? ""}
                  </Td>
                  <Td><Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
