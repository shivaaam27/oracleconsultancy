"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "./toast";
import { exportComplianceCsvAction } from "@/app/documents/actions";

/** Download the portfolio compliance sheet (CSV) — companies + people. */
export function ComplianceExportButton() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function onClick() {
    setBusy(true);
    startTransition(async () => {
      const res = await exportComplianceCsvAction();
      setBusy(false);
      if (!res.ok) {
        toast(res.error, { tone: "danger" });
        return;
      }
      // Trigger a client-side download of the returned CSV text.
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Compliance sheet exported.", { tone: "success" });
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-xl bg-bg-elev px-3 py-2 text-sm font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted disabled:opacity-50"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export CSV
    </button>
  );
}
