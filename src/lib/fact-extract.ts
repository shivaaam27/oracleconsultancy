/**
 * fact-extract.ts — RULE-BASED (no AI) extraction of high-value, well-patterned
 * facts from a document's already-extracted text. Deterministic, instant, free —
 * runs on every intake so a re-uploaded passport/registration/tax doc yields exact
 * structured values (passport no, TIN, VRN, national ID, share capital) that power
 * instant answers, without Groq. Messy/ambiguous facts (shareholder splits,
 * director lists) are left to the Claude cloud agent fallback — not guessed here.
 *
 * Pure: takes text, returns typed facts + identity-field fills. The caller owns
 * writing them (facts ledger + blanks-only column fill). High precision over
 * recall — a missed fact is fine; a WRONG one is not.
 */
import type { ExtractedFact } from "@/app/documents/actions";

export type ExtractedIdentity = {
  /** Person identity columns to fill when blank. */
  passportNo?: string;
  nationalId?: string;
  /** Company/person tax identifiers. */
  tin?: string;
  vrn?: string;
};

export type FactExtraction = {
  facts: ExtractedFact[];
  /** Identity values for blanks-only column fill on the owning person/company. */
  identity: ExtractedIdentity;
};

// Normalise: collapse internal spaces in an ID token (OCR often splits them).
const squash = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/**
 * Extract deterministic facts from document text. `hasPerson`/`hasCompany` tell
 * us which owner kinds exist on this document, so we only emit facts we can
 * actually attribute.
 */
export function extractFactsFromText(
  text: string | null | undefined,
  opts: { hasPerson: boolean; hasCompany: boolean },
): FactExtraction {
  const facts: ExtractedFact[] = [];
  const identity: ExtractedIdentity = {};
  const t = (text ?? "").replace(/ /g, " ");
  if (!t.trim()) return { facts, identity };

  const push = (entityType: "person" | "company", field: string, value: string) => {
    if ((entityType === "person" && !opts.hasPerson) || (entityType === "company" && !opts.hasCompany)) return;
    if (!facts.some((f) => f.entityType === entityType && f.field === field)) {
      facts.push({ entityType, field, value });
    }
  };

  // Passport number — 1–2 letters + 6–8 digits, near the word "passport".
  const passport = /\bpassport\s*(?:no|number|#|n[o°]?\.?)?\s*[:.\-]?\s*([A-Z]{1,2}\s?\d{6,8})\b/i.exec(t);
  if (passport && opts.hasPerson) {
    const v = squash(passport[1]);
    identity.passportNo = v;
    push("person", "Passport No", v);
  }

  // TIN — Tanzanian format NNN-NNN-NNN (or 9 digits). Applies to a company or a person.
  const tin = /\bTIN\s*(?:no|number)?\.?\s*[:.\-]?\s*(\d{2,3}[-\s]?\d{3}[-\s]?\d{3})\b/i.exec(t);
  if (tin) {
    const v = tin[1].replace(/\s/g, "").replace(/(\d{2,3})-?(\d{3})-?(\d{3})/, "$1-$2-$3");
    identity.tin = v;
    if (opts.hasCompany) push("company", "TIN", v);
    else if (opts.hasPerson) push("person", "TIN", v);
  }

  // VRN — VAT registration number, company only.
  const vrn = /\bVRN\s*(?:no|number)?\.?\s*[:.\-]?\s*(\d{2}[-\s]?\d{6}[-\s]?[A-Z])\b/i.exec(t);
  if (vrn && opts.hasCompany) {
    const v = squash(vrn[1]).replace(/(\d{2})-?(\d{6})-?([A-Z])/, "$1-$2-$3");
    identity.vrn = v;
    push("company", "VRN", v);
  }

  // National ID (NIDA) — 20 digits, usually grouped 8-5-5-2. Person only.
  const nida = /\b(?:NIDA|national\s*id(?:entity)?(?:\s*(?:no|number|card))?)\s*[:.\-]?\s*(\d{8}[-\s]?\d{5}[-\s]?\d{5}[-\s]?\d{2}|\d{20})\b/i.exec(t);
  if (nida && opts.hasPerson) {
    const digits = nida[1].replace(/\D/g, "");
    if (digits.length === 20) {
      const v = `${digits.slice(0, 8)}-${digits.slice(8, 13)}-${digits.slice(13, 18)}-${digits.slice(18)}`;
      identity.nationalId = v;
      push("person", "National ID", v);
    }
  }

  // Authorised share capital — company only. Take the amount that follows.
  const capital = /auth?ori[sz]ed\s+share\s+capital[^\d]{0,24}([\d,]{4,})/i.exec(t);
  if (capital && opts.hasCompany) {
    const v = capital[1].replace(/,/g, "");
    push("company", "Authorised Share Capital", v);
  }

  return { facts, identity };
}
