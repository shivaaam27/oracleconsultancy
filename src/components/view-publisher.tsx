"use client";

import { useEffect } from "react";
import { setCurrentView, clearCurrentView } from "@/lib/current-view";

/**
 * Publishes the currently-visible task codes to the global current-view store so
 * the assistant can act on "these". Renders nothing. Clears on unmount.
 */
export function ViewPublisher({ codes, label }: { codes: string[]; label?: string }) {
  const key = codes.join(",");
  useEffect(() => {
    setCurrentView({ codes, label });
    return () => clearCurrentView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, label]);
  return null;
}
