"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Opens the server-generated Director Brief PDF. We navigate to the PDF URL
 * (the browser renders it natively) rather than fetching it into a blob and
 * triggering a synthetic <a download> click — that JS download trick is silently
 * blocked on iOS Safari and inside the installed app, which is why the brief
 * "couldn't download or load on mobile". A plain new-tab navigation works
 * everywhere: desktop opens/saves it, phones open it in the PDF viewer (where
 * save/share is available). Same file, same behaviour on web and mobile.
 */
export function BriefPdfButton({
  href,
  label = "Download PDF",
  variant = "secondary",
  size = "sm",
}: {
  href: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md" | "lg";
}) {
  function open() {
    // Synchronous (in the click) so it isn't treated as a blocked pop-up.
    const w = window.open(href, "_blank", "noopener");
    if (!w) window.location.href = href; // pop-up blocked → same tab
  }

  return (
    <Button type="button" size={size} variant={variant} onClick={open}>
      <Download size={14} /> {label}
    </Button>
  );
}
