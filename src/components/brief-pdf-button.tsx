"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Downloads the server-generated Director Brief PDF. We hit the PDF route with
 * `?download=1`, which makes the server send `Content-Disposition: attachment`,
 * so the browser saves the file instead of opening it in the PDF viewer. A
 * same-tab navigation to an attachment URL downloads without leaving the page
 * (no blank tab), and works on desktop and mobile alike. We avoid the old
 * blob + synthetic `<a download>` trick — that was silently blocked on iOS
 * Safari and inside the installed app.
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
  function download() {
    const url = href + (href.includes("?") ? "&" : "?") + "download=1";
    // Navigating to an `attachment` URL downloads the file in place — the page
    // stays put, no blank tab.
    window.location.href = url;
  }

  return (
    <Button type="button" size={size} variant={variant} onClick={download}>
      <Download size={14} /> {label}
    </Button>
  );
}
