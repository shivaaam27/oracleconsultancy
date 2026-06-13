import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Back navigation for pages reached via the nav "Go to" menu (Companies, People,
 * Documents, etc.). Offers "‹ Home" (the old "‹ HRMS" pointed at /hrms, which now
 * just redirects to Tax & Legal — a dead end); when arrived from a task (via
 * `?from=task:CODE`), also offers "‹ CODE" back to that task.
 *
 * Reusable: pass the `from` search param straight through from the page.
 */
export function HrmsCrumbs({ from }: { from?: string | string[] }) {
  const raw = Array.isArray(from) ? from[0] : from;
  const taskCode =
    raw && raw.startsWith("task:") && /^[A-Za-z]{2,6}-\d{1,5}$/.test(raw.slice(5))
      ? raw.slice(5).toUpperCase()
      : null;

  const crumb = "inline-flex items-center gap-0.5 text-accent hover:underline";

  return (
    <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] mb-1">
      <Link href="/" className={crumb}>
        <ChevronLeft size={12} /> Home
      </Link>
      {taskCode && (
        <>
          <span className="text-fg-subtle">·</span>
          <Link href={`/task/${taskCode}`} className={crumb}>
            <ChevronLeft size={12} /> {taskCode}
          </Link>
        </>
      )}
    </div>
  );
}
