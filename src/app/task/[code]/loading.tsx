"use client";

/**
 * While a task page is on its way from the server, draw THE TASK — from the
 * copy the Tasks page already read (the side panel, the row under the pointer,
 * the step before; lib/task-detail-cache.ts) — instead of a loading screen.
 * The owner: "I shouldn't feel like there's a loading screen at all."
 *
 * It is the very same record component the page renders, so when the page
 * lands nothing visibly changes. With no copy in memory it draws nothing,
 * which for the fraction of a second it lasts is calmer than a skeleton the
 * wrong shape (the parent `task/loading.tsx` is a board skeleton, and it
 * still serves /task/new and /task/recurring).
 *
 * Whether the Studio look is on is read from `<html data-studio-pages>` (root
 * layout) — a loading boundary is given no props. First render is empty on
 * purpose, so a hard load hydrates cleanly.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TaskRecordPage } from "@/components/task-drawer";
import { cachedTaskDetail } from "@/lib/task-detail-cache";
import { isStudioOn } from "@/lib/studio";

export default function TaskLoading() {
  const pathname = usePathname();
  const [ready, setReady] = useState<{ studio: boolean } | null>(null);
  useEffect(() => { setReady({ studio: isStudioOn(document.documentElement.dataset.studioPages, "tasks") }); }, []);
  const raw = /^\/task\/([^/?#]+)/.exec(pathname)?.[1];
  const code = raw ? decodeURIComponent(raw) : null;
  if (!ready || !code || !cachedTaskDetail(code)) return null;
  return <TaskRecordPage code={code} studio={ready.studio} />;
}
