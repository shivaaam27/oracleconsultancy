"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

/**
 * Downloads the server-generated Director Brief PDF. Fetches the file so we can
 * show a "preparing" spinner (the PDF takes a second or two to render) and
 * surface a friendly message if it fails — then triggers a real file download,
 * which behaves reliably on mobile and the installed app (unlike window.print).
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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? "Director-Brief.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast("Couldn't generate the PDF just now — please try again", { tone: "warn" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" size={size} variant={variant} loading={loading} onClick={download}>
      <Download size={14} /> {label}
    </Button>
  );
}
