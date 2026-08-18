"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

/** Opens the browser print dialogue — where "Save as PDF" also lives, which is
 *  how the owner will actually use it. */
export function ProjectPrintButton() {
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      <Printer size={14} /> Print / PDF
    </Button>
  );
}
