import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getAllTasks } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { Card, TableShell, Th, Td, Badge, Button, FieldLabel, Input, Select, Textarea, EmptyState } from "@/components/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateTask, deleteTask } from "../actions";
import { STATUSES, PRIORITIES, RISKS } from "@/lib/constants";
import { ArrowLeft, Save, Trash2, History } from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}
function dateInput(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  if (f === "closed") return "default";
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "warn";
  if (f === "on-track") return "success";
  return "default";
}

export default async function TaskPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const all = await getAllTasks();
  const r = all.find((t) => t.code === code);
  if (!r) return notFound();
  const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.taskCode, code)).orderBy(desc(schema.auditLog.createdAt));

  const update = updateTask.bind(null, code);
  const remove = deleteTask.bind(null, code);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/registry" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={12} /> Registry
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs text-fg-muted">{r.code}</span>
            <span className="text-fg-subtle">·</span>
            <Link href={`/companies/${r.companyId}`} className="text-xs text-fg-muted hover:text-accent">{r.companyName}</Link>
            <span className="text-fg-subtle">·</span>
            <Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{r.actionItem}</h1>
          <div className="text-xs text-fg-muted mt-2">
            Created {fmt(r.createdDate)} · Last updated {fmt(r.lastUpdatedAt)}
            {r.closedDate ? ` · Closed ${fmt(r.closedDate)}` : ""}
            {" · Days open: "}<span className="tabular">{r.daysOpen ?? "—"}</span>
            {" · DTD: "}<span className="tabular">{r.daysToDeadline === "done" ? "✓" : r.daysToDeadline ?? "—"}</span>
          </div>
        </div>
        <form action={remove}>
          <Button variant="danger" type="submit"><Trash2 size={13} /> Delete</Button>
        </form>
      </div>

      <Card className="p-6">
        <form action={update} className="space-y-5">
          <div>
            <FieldLabel>Action Item</FieldLabel>
            <Input name="actionItem" defaultValue={r.actionItem} required />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <FieldLabel>Department</FieldLabel>
              <Input name="department" defaultValue={r.department || ""} />
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <Select name="status" defaultValue={r.status}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Priority</FieldLabel>
              <Select name="priority" defaultValue={r.priority}>
                {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Risk</FieldLabel>
              <Select name="risk" defaultValue={r.risk || ""}>
                <option value="">—</option>
                {RISKS.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Escalation</FieldLabel>
              <Select name="escalation" defaultValue={r.escalation || "No"}>
                <option>No</option>
                <option>Yes</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Category</FieldLabel>
              <Input name="category" defaultValue={r.category || ""} />
            </div>
            <div>
              <FieldLabel>Meeting Date</FieldLabel>
              <Input name="meetingDate" type="date" defaultValue={dateInput(r.meetingDate)} />
            </div>
            <div>
              <FieldLabel>Deadline</FieldLabel>
              <Input name="deadline" type="date" defaultValue={dateInput(r.deadline)} />
            </div>
            <div>
              <FieldLabel>Accountable (comma-separated)</FieldLabel>
              <Input name="accountable" defaultValue={r.assignees.join(", ")} />
            </div>
          </div>

          <div>
            <FieldLabel>Latest Update</FieldLabel>
            <Input name="latestUpdate" defaultValue={r.latestUpdate || ""} />
          </div>

          <div>
            <FieldLabel>Comments</FieldLabel>
            <Textarea name="comments" defaultValue={r.comments || ""} rows={3} />
          </div>

          <div>
            <FieldLabel>Change Reason <span className="text-fg-subtle normal-case font-normal">(optional, recorded in audit)</span></FieldLabel>
            <Input name="changeReason" placeholder="Why are you making this change?" />
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-border">
            <Button type="submit"><Save size={13} /> Save changes</Button>
          </div>
        </form>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
            <History size={12} /> Audit Timeline · {audit.length} entries
          </h2>
        </div>
        <TableShell>
          {audit.length === 0 ? (
            <EmptyState title="No audit entries yet." hint="Changes you save will appear here." />
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Field</Th>
                  <Th>Old</Th>
                  <Th>New</Th>
                  <Th>Reason</Th>
                  <Th>By</Th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-mono text-xs text-fg-muted whitespace-nowrap">{fmt(a.createdAt)}</Td>
                    <Td>{a.field}</Td>
                    <Td className="text-fg-muted max-w-xs truncate">{a.oldValue}</Td>
                    <Td className="max-w-xs truncate">{a.newValue}</Td>
                    <Td className="text-fg-muted">{a.changeReason}</Td>
                    <Td className="text-xs text-fg-muted">{a.createdBy}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      </section>
    </div>
  );
}
