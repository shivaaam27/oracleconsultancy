import type { BriefData } from "@/lib/director-brief";
import { BRAND_NAME } from "@/lib/brand";

/** A safe, human-readable download filename for a Director Brief PDF. */
export function briefPdfFilename(b: BriefData): string {
  // A person filter is the most specific thing selected, so it names the file.
  const who = b.selectedPersonName ?? b.selectedCompanyName ?? BRAND_NAME;
  const raw = `Director Brief ${who} ${b.monthLabel}`;
  const safe = raw.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${safe}.pdf`;
}
