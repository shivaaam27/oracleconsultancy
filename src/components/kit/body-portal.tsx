"use client";

/**
 * Render an overlay at the top of the page (in <body>), not inside the page.
 *
 * ⚠️ A sheet drawn inside the page lives in the page's stacking context: the
 * Studio footer then paints OVER it, and its last row hides under the footer
 * (the task page's "…" sheet, 26 Sept 2026). Every full-screen overlay that a
 * page renders goes through here.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
