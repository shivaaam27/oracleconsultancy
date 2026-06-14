"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/* Portal error boundary. Catches any render/data error inside a portal page so
 * staff see a friendly, recoverable message instead of a blank or broken screen
 * (the common cause of "the page couldn't load — I had to reload"). The portal
 * shell (header + bottom pill) stays put, so they can still navigate away.
 *
 * Next handles redirect()/notFound() itself — those never reach here. */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Diagnostics only — never throw from inside the boundary.
    console.error("[portal] page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft/50 text-danger ring-1 ring-danger/20">
        <AlertTriangle size={26} />
      </span>
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          That didn&apos;t load properly — usually a brief connection hiccup. Tap
          &ldquo;Try again&rdquo; and it should come straight back.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
        >
          <RotateCcw size={15} /> Try again
        </button>
        <Link
          href="/portal"
          className="inline-flex items-center gap-2 rounded-full bg-bg-elev px-5 py-2.5 text-sm font-medium ring-1 ring-border transition-colors hover:text-fg"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
