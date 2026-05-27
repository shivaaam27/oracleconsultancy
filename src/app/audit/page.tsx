import { sb } from "@/db/supabase";
import { PageHeader, TableShell, Th, Td } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmt(d: string | null) {
  return d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—";
}

type AuditRow = {
  id: number;
  task_code: string | null;
  company_id: number | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  created_by: string | null;
};

export default async function AuditPage() {
  const [{ data: rowsRaw }, { data: companiesRaw }] = await Promise.all([
    sb
      .from("audit_log")
      .select("id,task_code,company_id,field,old_value,new_value,created_at,created_by")
      .order("created_at", { ascending: false })
      .limit(500),
    sb.from("companies").select("id,name"),
  ]);
  const rows = (rowsRaw ?? []) as AuditRow[];
  const cMap = new Map((companiesRaw ?? []).map((c) => [c.id as number, c.name as string]));

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
                <Td className="font-mono text-xs text-fg-muted whitespace-nowrap">{fmt(a.created_at)}</Td>
                <Td className="whitespace-nowrap">{a.company_id ? cMap.get(a.company_id) : ""}</Td>
                <Td className="font-mono text-xs">
                  {a.task_code ? <Link href={`/task/${a.task_code}`} className="hover:text-accent">{a.task_code}</Link> : ""}
                </Td>
                <Td>{a.field}</Td>
                <Td className="text-fg-muted max-w-xs truncate">{a.old_value}</Td>
                <Td className="max-w-xs truncate">{a.new_value}</Td>
                <Td className="text-xs text-fg-muted">{a.created_by}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
