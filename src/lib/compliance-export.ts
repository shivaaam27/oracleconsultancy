// Client-safe builders for compliance exports (CSV). No server imports — takes
// already-computed ComplianceScore[] so it can run on either side.
import type { ComplianceScore } from "@/lib/compliance";

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  // Quote if it contains a comma, quote, or newline; double any quotes inside.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  "Owner",
  "Type",
  "Compliance %",
  "Band",
  "Required",
  "Verified",
  "In progress",
  "Missing/expired",
  "Expired",
  "Expiring",
  "Monitored documents",
  "Outstanding items",
];

/**
 * Flat one-row-per-owner compliance sheet (companies first, then people),
 * worst score first within each group. "Outstanding items" lists the gap
 * labels so the reader sees exactly what's owed.
 */
export function buildComplianceCsv(
  companyScores: ComplianceScore[],
  personScores: ComplianceScore[]
): string {
  const order = (a: ComplianceScore, b: ComplianceScore) => a.score - b.score || b.expired - a.expired;
  const rows = [...[...companyScores].sort(order), ...[...personScores].sort(order)];

  const lines = [HEADERS.map(csvCell).join(",")];
  for (const s of rows) {
    const gaps = s.gaps.map((g) => g.label).join("; ");
    lines.push(
      [
        csvCell(s.ownerName),
        csvCell(s.ownerType === "company" ? "Company" : "Person"),
        csvCell(s.score),
        csvCell(s.status),
        csvCell(s.required),
        csvCell(s.present),
        csvCell(s.inProgress),
        csvCell(s.missing),
        csvCell(s.expired),
        csvCell(s.expiring),
        csvCell(s.monitoredDocuments),
        csvCell(gaps),
      ].join(",")
    );
  }
  return lines.join("\r\n");
}

/** A dated, filesystem-safe filename for the export. */
export function complianceCsvFilename(date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `compliance-${iso}.csv`;
}
