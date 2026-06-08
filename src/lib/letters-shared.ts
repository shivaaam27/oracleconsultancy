/* Client-safe letter types + template catalogue. No server imports. */

export type LetterStatus = "Draft" | "Issued";

export type LetterheadMode = "typed" | "images" | "background";

export type Letterhead = {
  mode: LetterheadMode;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  registrationNo: string | null;
  tin: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  logoPath: string | null;
  headerImagePath: string | null;
  footerImagePath: string | null;
  backgroundImagePath: string | null;
  contentTopMm: number | null;
  contentBottomMm: number | null;
};

export type LetterRow = {
  id: number;
  type: string;
  title: string;
  companyId: number | null;
  companyName: string | null;
  personId: number | null;
  personName: string | null;
  ref: string | null;
  status: LetterStatus;
  letterDate: string | null;
  issuedAt: string | null;
  updatedAt: string;
};

/** What the catalogue shows in the "New letter" picker. */
export const LETTER_TEMPLATES: Array<{ id: string; label: string; group: string; needsPerson: boolean }> = [
  { id: "invitation", label: "Invitation letter (from abroad)", group: "Immigration / expat", needsPerson: true },
  { id: "blank", label: "Blank / custom letter", group: "General", needsPerson: false },
];

export function templateLabel(id: string): string {
  return LETTER_TEMPLATES.find((t) => t.id === id)?.label ?? "Letter";
}
