"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PersonPackPrintButton() {
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      <Printer size={14} /> PDF
    </Button>
  );
}
