import { sb } from "@/db/supabase";
import { PageHeader, TableShell, Th, Td, Badge } from "@/components/ui";
import { Mail } from "lucide-react";

export const dynamic = "force-dynamic";

type Person = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferred_channel: string | null;
  role: string | null;
  company_id: number | null;
  contact_status: string | null;
};

export default async function PeoplePage() {
  const [{ data: peopleRaw }, { data: companiesRaw }] = await Promise.all([
    sb.from("people").select("id,name,email,phone,whatsapp,preferred_channel,role,company_id,contact_status"),
    sb.from("companies").select("id,name"),
  ]);
  const people = (peopleRaw ?? []) as Person[];
  const cMap = new Map((companiesRaw ?? []).map((c) => [c.id as number, c.name as string]));
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
                <Td className="text-fg-muted">{p.company_id ? cMap.get(p.company_id) : ""}</Td>
                <Td className="text-fg-muted">{p.role || ""}</Td>
                <Td>{p.email ? <a href={`mailto:${p.email}`} className="hover:text-accent inline-flex items-center gap-1"><Mail size={12} />{p.email}</a> : <span className="text-fg-subtle">—</span>}</Td>
                <Td className="tabular text-sm">{p.phone || <span className="text-fg-subtle">—</span>}</Td>
                <Td className="tabular text-sm">{p.whatsapp || <span className="text-fg-subtle">—</span>}</Td>
                <Td>{p.preferred_channel ? <Badge tone="info">{p.preferred_channel}</Badge> : ""}</Td>
                <Td>{p.contact_status === "Complete" ? <Badge tone="success">Complete</Badge> : p.contact_status ? <Badge tone="warn">{p.contact_status}</Badge> : ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
