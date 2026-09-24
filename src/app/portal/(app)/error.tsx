"use client";

import { useEffect } from "react";
import { StudioOops } from "@/components/studio/oops";

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
    <StudioOops
      kind="error"
      title="This page didn’t load"
      body="Usually a brief connection hiccup. Try again — if it keeps happening, reload the page."
      home="/portal"
      onRetry={() => reset()}
      reference={error.digest}
    />
  );
}
