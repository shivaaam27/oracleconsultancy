import { PageHeader } from "@/components/ui";
import { listPendingInbox } from "./actions";
import { InboxList } from "./inbox-list";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await listPendingInbox();
  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Inbox"
        sub="Forwarded emails and shared messages waiting to become a task or a note."
      />
      <InboxList items={items} />
    </div>
  );
}
