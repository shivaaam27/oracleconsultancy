import { redirect } from "next/navigation";

/**
 * The standalone task page was merged into the task drawer (the pop-up is now
 * the single, full-parity task view). Any /task/CODE link — including old/legacy
 * codes and external deep-links — redirects to the tasks list with the drawer
 * open over it. The drawer's API resolves legacy codes to the canonical task.
 */
export default async function TaskPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/?tab=tasks&task=${encodeURIComponent(code)}`);
}
