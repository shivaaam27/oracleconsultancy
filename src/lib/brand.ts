/**
 * The parent brand name shown on every person-facing or printed artefact
 * (packs, letters, briefs, reminders). Kept in one place so the legal name
 * stays consistent system-wide. Note this is the BRAND label, distinct from
 * the CO04 "Oracle Consultancy" company record used for task prefixes etc.
 */
export const BRAND_NAME = "Oracle Consultancy Limited";

/**
 * The full company name to print on formal artefacts (e.g. the staff data form).
 * Prefers the registered `legal_name` over the short display `name`, but strips a
 * trailing internal-note parenthetical such as "(… NOT a registered company)"
 * while keeping a genuine name part like "(Tanzania)". Falls back to the short
 * name when no usable legal name is set.
 */
export function fullCompanyName(name: string, legalName: string | null | undefined): string {
  const legal = (legalName ?? "").trim();
  if (!legal) return name;
  const cleaned = legal.replace(/\s*\([^)]*\bnot\b[^)]*\)\s*$/i, "").trim();
  return cleaned || name;
}
