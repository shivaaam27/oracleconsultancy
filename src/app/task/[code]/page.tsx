import { TaskRecordPage } from "@/components/tasks/task-drawer";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";

/**
 * /task/CODE — the task record, at its own URL.
 *
 * A record is a page, as in ERPNext (owner's decision, Aug 2026). This replaced
 * the old redirect into the drawer. The drawer still exists for legacy
 * `?task=CODE` links; everything in the app now links here via taskHref().
 *
 * Legacy codes resolve through the record's own API, so old deep links keep
 * working.
 *
 * Studio (Settings → New look → Tasks) lays the same record out as the
 * mockup's expanded view; the switch that turns on the new Tasks list turns
 * this on with it, so the two always match.
 */
export default async function TaskPage({ params }: { params: Promise<{ code: string }> }) {
  // The owner, or a director (lib/auth/viewer.ts) — the record's data route then
  // refuses a task outside their companies.
  if (!(await getViewer())) redirect("/portal");
  const { code } = await params;
  // `stamp` is new on every server render, so a router.refresh() after an
  // in-place edit makes the record read itself again (see TaskRecord).
  return <TaskRecordPage code={decodeURIComponent(code)} stamp={Date.now()} />;
}
