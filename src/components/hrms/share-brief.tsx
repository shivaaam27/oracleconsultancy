"use client";

import { useState } from "react";
import { MessageCircle, Mail, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { BriefPdfButton } from "@/components/brief-pdf-button";
import { useToast } from "@/components/toast";

/**
 * One-tap share for the Director Brief — Download PDF, WhatsApp, Email, or Copy.
 * The text is built server-side and passed in; the PDF is a real server-rendered
 * file fetched from `pdfHref` (replaces the old browser print-to-PDF).
 */
export function ShareBrief({
  text,
  emailSubject,
  emailBody,
  pdfHref,
}: {
  text: string;
  emailSubject: string;
  emailBody: string;
  pdfHref: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }
  function email() {
    window.location.href = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Brief copied", { tone: "success", duration: 2500 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy", { tone: "warn" });
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap print-hidden">
      <BriefPdfButton href={pdfHref} label="Download PDF" variant="secondary" size="sm" />
      <Button size="sm" onClick={whatsapp}><MessageCircle size={14} /> WhatsApp</Button>
      <Button size="sm" variant="secondary" onClick={email}><Mail size={14} /> Email</Button>
      <Button size="sm" variant="secondary" onClick={copy}>
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
