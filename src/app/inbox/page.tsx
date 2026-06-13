import { PageHeader } from "@/components/ui";
import { listPendingInbox } from "./actions";
import { InboxList } from "./inbox-list";
import { AddInboxDialog } from "@/components/add-inbox-dialog";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const [items, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listPendingInbox(),
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <PageHeader
        title="Inbox"
        sub="Forwarded emails, shared messages and uploaded bundles waiting to be filed."
        action={<AddInboxDialog />}
      />
      <InboxList items={items} companies={companies} people={people} />
    </div>
  );
}
