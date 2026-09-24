"use client";

import { useEffect } from "react";
import { StudioOops } from "@/components/studio/oops";

/* Admin-side error boundary (renders inside the root layout, so the nav pill
 * stays). Any unhandled error in an admin page lands here as a recoverable
 * message instead of a blank/broken screen. Next handles redirect()/notFound()
 * itself — those never reach here. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] page error:", error);
  }, [error]);

  return (
    <StudioOops
      kind="error"
      title="This page didn’t load"
      body="Usually a brief connection hiccup. Try again — if it keeps happening, reload the page."
      home="/"
      onRetry={() => reset()}
      reference={error.digest}
    />
  );
}
