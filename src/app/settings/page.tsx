import { sb } from "@/db/supabase";
import { PageHeader, TableShell, Th, Td } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { data: rowsRaw } = await sb.from("settings").select("key,value");
  const rows = (rowsRaw ?? []) as { key: string; value: string | null }[];
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" sub="Read-only · Editable controls coming in Phase 4" />
      <TableShell>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Key</Th>
              <Th>Value</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.key} className="hover:bg-bg-subtle">
                <Td className="font-medium">{s.key}</Td>
                <Td className="font-mono text-xs text-fg-muted">{s.value ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
