import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { PageHeader, TableShell, Th, Td } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

export default async function AuditPage() {
  const rows = await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(500);
  const companies = await db.select().from(schema.companies);
  const cMap = new Map(companies.map((c) => [c.id, c.name]));
  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log" sub={`Showing latest ${rows.length} entries`} />
      <TableShell>
        <table className="w-full">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Company</Th>
              <Th>Task</Th>
              <Th>Field</Th>
              <Th>Old</Th>
              <Th>New</Th>
              <Th>By</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-bg-subtle transition-colors">
                <Td className="font-mono text-xs text-fg-muted whitespace-nowrap">{fmt(a.createdAt)}</Td>
                <Td className="whitespace-nowrap">{a.companyId ? cMap.get(a.companyId) : ""}</Td>
                <Td className="font-mono text-xs">
                  {a.taskCode ? <Link href={`/task/${a.taskCode}`} className="hover:text-accent">{a.taskCode}</Link> : ""}
                </Td>
                <Td>{a.field}</Td>
                <Td className="text-fg-muted max-w-xs truncate">{a.oldValue}</Td>
                <Td className="max-w-xs truncate">{a.newValue}</Td>
                <Td className="text-xs text-fg-muted">{a.createdBy}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
