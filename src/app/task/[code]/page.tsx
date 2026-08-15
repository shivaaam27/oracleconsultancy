import { TaskRecordPage } from "@/components/task-drawer";

/**
 * /task/CODE — the task record, at its own URL.
 *
 * A record is a page, as in ERPNext (owner's decision, Aug 2026). This replaced
 * the old redirect into the drawer. The drawer still exists for legacy
 * `?task=CODE` links; everything in the app now links here via taskHref().
 *
 * Legacy codes resolve through the record's own API, so old deep links keep
 * working.
 */
export default async function TaskPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TaskRecordPage code={decodeURIComponent(code)} />;
}
