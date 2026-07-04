import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Inbox merged into the Documents page (June 2026). The intake queues now live on
// the "To Sort" tab. Keep this route so old links/bookmarks still land somewhere.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  redirect(from ? `/documents?tab=sort&from=${encodeURIComponent(from)}` : "/documents?tab=sort");
}
