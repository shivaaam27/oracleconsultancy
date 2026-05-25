import { db, schema } from "@/db";
import { PageHeader, TableShell, Th, Td, Badge } from "@/components/ui";
import { Mail, Phone, MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const people = await db.select().from(schema.people);
  const companies = await db.select().from(schema.companies);
  const cMap = new Map(companies.map((c) => [c.id, c.name]));
  return (
    <div className="space-y-4">
      <PageHeader title="People Directory" sub={`${people.length} contacts`} />
      <TableShell>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Role</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>WhatsApp</Th>
              <Th>Channel</Th>
              <Th>Contact</Th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="hover:bg-bg-subtle transition-colors">
                <Td className="font-medium">{p.name}</Td>
                <Td className="text-fg-muted">{p.companyId ? cMap.get(p.companyId) : ""}</Td>
                <Td className="text-fg-muted">{p.role || ""}</Td>
                <Td>{p.email ? <a href={`mailto:${p.email}`} className="hover:text-accent inline-flex items-center gap-1"><Mail size={12} />{p.email}</a> : <span className="text-fg-subtle">—</span>}</Td>
                <Td className="tabular text-sm">{p.phone || <span className="text-fg-subtle">—</span>}</Td>
                <Td className="tabular text-sm">{p.whatsapp || <span className="text-fg-subtle">—</span>}</Td>
                <Td>{p.preferredChannel ? <Badge tone="info">{p.preferredChannel}</Badge> : ""}</Td>
                <Td>{p.contactStatus === "Complete" ? <Badge tone="success">Complete</Badge> : p.contactStatus ? <Badge tone="warn">{p.contactStatus}</Badge> : ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
