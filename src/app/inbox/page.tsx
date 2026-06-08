import { PageHeader } from "@/components/ui";
import { listPendingInbox } from "./actions";
import { InboxList } from "./inbox-list";
import { AddInboxDialog } from "@/components/add-inbox-dialog";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await listPendingInbox();
  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Inbox"
        sub="Forwarded emails, shared messages and uploaded bundles waiting to be filed."
        action={<AddInboxDialog />}
      />
      <InboxList items={items} />
    </div>
  );
}
