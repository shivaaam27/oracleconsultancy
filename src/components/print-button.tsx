"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

/** Generic "Print / Save as PDF" button — triggers the browser print dialog. */
export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      <Printer size={14} /> {label}
    </Button>
  );
}
