// doc-catalog.ts — the canonical catalogue of the business document TYPES the
// system knows. This is the "brain": once a document's type is identified,
// everything downstream (shelf, category, owner kind, whether it expires, and the
// exact compliance requirement it satisfies) is a LOOKUP, not a guess. Client-safe
// (pure data + functions, no DB/AI imports).
//
// Why: intake used to free-guess category/owner/requirement per document and got
// them wrong (NSSF → Immigration, a BRELA search → Lease, VAT verified by a
// business licence). Routing every document through a KNOWN type kills those
// failure modes — an NSSF certificate is ALWAYS People & HR + the NSSF requirement.

import type { DocShelf, DocCategory } from "./documents-shared";

export type CatalogType = {
  key: string;
  /** Display name — feeds the document title. */
  label: string;
  /** Lowercase phrases; a hit in filename/title/body identifies this type. Order
   *  longer/more-specific first. */
  aliases: string[];
  shelf: DocShelf;
  category: DocCategory;
  /** Who a document of this type belongs to. */
  ownerType: "company" | "person" | "either";
  /** Does it carry an expiry to track + renew? */
  expires: boolean;
  /** The company_requirements.source_key this satisfies (if any). */
  companyReqKey?: string;
  /** The person_requirements.label this satisfies (if any). */
  personReqLabel?: string;
  /** Optional in-flight pipeline this document belongs to. */
  pipeline?: string;
};

// Ordered most-specific first so the classifier prefers precise matches.
export const DOC_CATALOG: CatalogType[] = [
  // ── Legal & Registration ────────────────────────────────────────────────
  { key: "certificate-of-incorporation", label: "Certificate of Incorporation", aliases: ["certificate of incorporation", "incorporation certificate"], shelf: "Legal & Registration", category: "Registration", ownerType: "company", expires: false, companyReqKey: "company-registration" },
  { key: "memart", label: "Memorandum and Articles (MEMART)", aliases: ["memorandum and articles", "memarts", "memart", "articles of association", "memorandum of association", "memorandum"], shelf: "Legal & Registration", category: "Legal", ownerType: "company", expires: false, companyReqKey: "memarts" },
  { key: "ubo-register", label: "Beneficial Ownership Register (UBO)", aliases: ["beneficial ownership", "beneficial owner", "ultimate beneficial", "ubo register", "ubo"], shelf: "Legal & Registration", category: "Registration", ownerType: "company", expires: false, companyReqKey: "ubo-register" },
  { key: "annual-return", label: "BRELA Annual Return", aliases: ["annual return", "annual returns"], shelf: "Legal & Registration", category: "Registration", ownerType: "company", expires: false, companyReqKey: "annual-return" },
  { key: "brela-search", label: "BRELA Search", aliases: ["brela search", "company search", "brela company search", "search report", "registry search", "brela"], shelf: "Legal & Registration", category: "Registration", ownerType: "company", expires: false },
  { key: "change-of-name", label: "Change of Name", aliases: ["change of name", "change-of-name"], shelf: "Legal & Registration", category: "Registration", ownerType: "company", expires: false },
  { key: "change-of-particulars", label: "Change of Company Particulars", aliases: ["change of company particulars", "change of particulars", "change-of-company-particulars"], shelf: "Legal & Registration", category: "Registration", ownerType: "company", expires: false },
  { key: "special-resolution", label: "Special Resolution", aliases: ["special resolution", "special-resolution", "board resolution", "resolution"], shelf: "Legal & Registration", category: "Legal", ownerType: "company", expires: false },
  { key: "statutory-registers", label: "Statutory Registers", aliases: ["statutory register", "register of members", "register of directors"], shelf: "Legal & Registration", category: "Registration", ownerType: "company", expires: false, companyReqKey: "statutory-registers" },
  { key: "company-stamp", label: "Company Stamp", aliases: ["company stamp", "rubber stamp", "seal"], shelf: "Legal & Registration", category: "Other", ownerType: "company", expires: false },

  // ── Licences & Permits ──────────────────────────────────────────────────
  { key: "business-licence", label: "Business Licence", aliases: ["business licence", "business license", "trading licence", "trading license", "business licensing act", "b.l. no", "bl no"], shelf: "Licences & Permits", category: "Licence", ownerType: "company", expires: true, companyReqKey: "business-licence", pipeline: "business-licence" },
  { key: "contractor-crb", label: "Contractor Registration (CRB)", aliases: ["crb", "contractors registration board", "contractor registration", "building contractor", "civil works contractor", "mechanical work contractor"], shelf: "Licences & Permits", category: "Permit", ownerType: "company", expires: true, companyReqKey: "contractor-registration" },
  { key: "local-content", label: "Local Content Plan Approval", aliases: ["local content", "local-content", "content plan"], shelf: "Licences & Permits", category: "Permit", ownerType: "company", expires: true, companyReqKey: "local-content" },
  { key: "osha-certificate", label: "OSHA Certificate", aliases: ["osha", "occupational safety and health", "occupational health and safety"], shelf: "Licences & Permits", category: "Certificate", ownerType: "company", expires: true, companyReqKey: "osha-registration" },
  { key: "fire-certificate", label: "Fire Safety Certificate", aliases: ["fire safety", "fire certificate", "fire inspection"], shelf: "Licences & Permits", category: "Certificate", ownerType: "company", expires: true, companyReqKey: "fire-certificate" },
  { key: "sector-permit", label: "Sector Permit", aliases: ["tfda", "tbs", "food permit", "sector permit"], shelf: "Licences & Permits", category: "Permit", ownerType: "company", expires: true, companyReqKey: "sector-permit" },

  // ── Tax ─────────────────────────────────────────────────────────────────
  { key: "tin-certificate", label: "TIN Certificate", aliases: ["tin certificate", "taxpayer identification number", "taxpayer id", "tin"], shelf: "Tax", category: "Tax", ownerType: "either", expires: false, companyReqKey: "tax-registration", personReqLabel: "TIN certificate" },
  { key: "vrn-certificate", label: "VRN Certificate", aliases: ["vrn certificate", "vat registration", "value added tax", "vrn"], shelf: "Tax", category: "Tax", ownerType: "company", expires: false, companyReqKey: "vat-registration" },
  { key: "tax-clearance", label: "Tax Clearance Certificate", aliases: ["tax clearance", "clearance certificate"], shelf: "Tax", category: "Tax", ownerType: "company", expires: true, companyReqKey: "tax-clearance" },
  { key: "tax-invoice", label: "Tax Invoice", aliases: ["tax invoice", "efd receipt", "fiscal receipt"], shelf: "Tax", category: "Tax", ownerType: "company", expires: false },
  { key: "audited-accounts", label: "Audited Accounts", aliases: ["audited accounts", "audited financial", "income tax return", "financial statements"], shelf: "Tax", category: "Tax", ownerType: "company", expires: false, companyReqKey: "audited-accounts" },

  // ── Banking & Finance ───────────────────────────────────────────────────
  { key: "bank-details", label: "Bank Details", aliases: ["bank details", "bank account", "account details", "banking details"], shelf: "Banking & Finance", category: "Banking", ownerType: "either", expires: false, companyReqKey: "bank-account", personReqLabel: "Bank details" },
  { key: "transaction-receipt", label: "Transaction Receipt", aliases: ["transaction receipt", "payment receipt", "m-pesa", "mpesa", "tigo pesa", "receipt", "payment slip", "bill payment"], shelf: "Banking & Finance", category: "Banking", ownerType: "either", expires: false },
  { key: "quotation", label: "Quotation", aliases: ["quotation", "proforma", "pro forma", "quote"], shelf: "Banking & Finance", category: "Contract", ownerType: "company", expires: false },

  // ── People & HR ─────────────────────────────────────────────────────────
  { key: "nssf", label: "NSSF Registration", aliases: ["nssf", "national social security fund"], shelf: "People & HR", category: "HR", ownerType: "company", expires: false, companyReqKey: "nssf-registration" },
  { key: "wcf", label: "WCF Registration", aliases: ["wcf", "workers compensation", "workers' compensation", "compensation fund"], shelf: "People & HR", category: "HR", ownerType: "company", expires: false, companyReqKey: "wcf-registration" },
  { key: "paye-sdl", label: "PAYE / SDL Registration", aliases: ["paye", "sdl", "skills development levy", "employer registration"], shelf: "People & HR", category: "HR", ownerType: "company", expires: false, companyReqKey: "paye-sdl-registration" },
  { key: "employment-contract", label: "Employment Contract", aliases: ["employment contract", "contract of employment", "employment agreement", "appointment letter", "labour contract", "staff contract", "contract"], shelf: "People & HR", category: "Contract", ownerType: "person", expires: false, personReqLabel: "Employment contract" },
  { key: "cv", label: "CV", aliases: ["curriculum vitae", "résumé", "resume", " cv "], shelf: "People & HR", category: "Other", ownerType: "person", expires: false, personReqLabel: "CV / résumé" },
  { key: "academic-certificate", label: "Academic Certificate", aliases: ["degree certificate", "diploma", "academic certificate", "transcript", "bachelor of", "master of"], shelf: "People & HR", category: "Certificate", ownerType: "person", expires: false, personReqLabel: "Academic / professional certificates" },
  { key: "national-id", label: "National ID (NIDA)", aliases: ["national id", "nida", "national identity"], shelf: "People & HR", category: "Other", ownerType: "person", expires: false, personReqLabel: "National ID (NIDA)" },

  // ── Immigration ─────────────────────────────────────────────────────────
  { key: "passport", label: "Passport", aliases: ["passport"], shelf: "Immigration", category: "Passport", ownerType: "person", expires: true, personReqLabel: "Passport" },
  { key: "passport-photo", label: "Passport Photo", aliases: ["passport photo", "passport-photo", "photograph"], shelf: "Immigration", category: "Other", ownerType: "person", expires: false, personReqLabel: "Passport photo" },
  { key: "work-permit", label: "Work Permit", aliases: ["work permit", "work-permit"], shelf: "Immigration", category: "Permit", ownerType: "person", expires: true, personReqLabel: "Work / residence permit", pipeline: "permit" },
  { key: "residence-permit", label: "Residence Permit", aliases: ["residence permit", "resident permit", "residence-permit"], shelf: "Immigration", category: "Permit", ownerType: "person", expires: true, personReqLabel: "Work / residence permit", pipeline: "permit" },
  { key: "visa", label: "Visa", aliases: ["business visa", "entry visa", "visa"], shelf: "Immigration", category: "Immigration", ownerType: "person", expires: true, personReqLabel: "Visa" },
  { key: "interim-pass", label: "Interim Pass", aliases: ["interim pass", "interim-pass", "pass endorsement", "passport endorsement"], shelf: "Immigration", category: "Immigration", ownerType: "person", expires: true, pipeline: "permit" },

  // ── Contracts & Leases ──────────────────────────────────────────────────
  { key: "lease", label: "Lease Agreement", aliases: ["lease agreement", "tenancy agreement", "lease", "godown", "premises lease"], shelf: "Contracts & Leases", category: "Lease", ownerType: "company", expires: true, companyReqKey: "premises-lease" },
  { key: "service-contract", label: "Service Contract", aliases: ["service contract", "service agreement", "maintenance contract", "cold room service"], shelf: "Contracts & Leases", category: "Contract", ownerType: "company", expires: true },
  { key: "commercial-contract", label: "Commercial Contract", aliases: ["distribution", "supply contract", "sales contract", "commercial contract", "partner agreement", "authorised distribution"], shelf: "Contracts & Leases", category: "Contract", ownerType: "company", expires: true },
  { key: "insurance", label: "Insurance Policy", aliases: ["insurance", "policy schedule", "cover note"], shelf: "Contracts & Leases", category: "Insurance", ownerType: "company", expires: true },

  // ── Operations & Branding ───────────────────────────────────────────────
  { key: "letterhead", label: "Letterhead", aliases: ["letterhead", "letter head"], shelf: "Operations & Branding", category: "Operations", ownerType: "company", expires: false },
  { key: "product-label", label: "Product Label", aliases: ["product label", "label", "packaging"], shelf: "Operations & Branding", category: "Operations", ownerType: "company", expires: false },
  { key: "packing-list", label: "Packing List", aliases: ["packing list", "commercial invoice", "bill of lading", "b/l"], shelf: "Operations & Branding", category: "Operations", ownerType: "company", expires: false },
  { key: "letter", label: "Letter", aliases: ["letter", "correspondence", "notice"], shelf: "Operations & Branding", category: "Operations", ownerType: "either", expires: false },
];

const BY_KEY = new Map(DOC_CATALOG.map((t) => [t.key, t]));

export function catalogType(key: string): CatalogType | undefined {
  return BY_KEY.get(key);
}

const norm = (s: string) => ` ${(s ?? "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ")} `;
const aliasWeight = (alias: string) => Math.max(2, Math.round(alias.length / 3));

/**
 * Score a document against the catalogue; best match first. The document NAME
 * (filename + title) is the strong signal and is weighted ~5× the body, so a
 * "WCF-Receipt" filename isn't overturned by a taxpayer number mentioned in the
 * body text. Pass the body separately (optional).
 */
export function classifyDocText(name: string, body = ""): { type: CatalogType; score: number }[] {
  const nameHay = norm(name);
  const bodyHay = norm(body);
  const scored: { type: CatalogType; score: number }[] = [];
  for (const type of DOC_CATALOG) {
    let score = 0;
    for (const alias of type.aliases) {
      const w = aliasWeight(alias);
      if (nameHay.includes(alias)) score += w * 10; // name match strongly dominates
      else if (bodyHay.includes(alias)) score += w; // body match is a weak hint
    }
    if (score > 0) scored.push({ type, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

/** The single best type, or null if nothing matched. */
export function bestDocType(name: string, body = ""): CatalogType | null {
  return classifyDocText(name, body)[0]?.type ?? null;
}

export type ParsedName = {
  prefix: string | null;
  /** Expiry from the `_EXP-YYYY-MM-DD` tag — the owner's own, reliable date. */
  expiry: string | null;
  /** `-OLD` / `-VOID` marker → this copy is superseded / should be knocked out. */
  isOld: boolean;
  ref: string | null;
};

/** Parse a conventional filename `Prefix_DocType_Ref_EXP-YYYY-MM-DD[-OLD].ext`. All
 *  fields are best-effort; absent when the file isn't conventionally named. */
export function parseConventionalName(filename: string): ParsedName {
  const base = (filename ?? "").replace(/\.[a-z0-9]+$/i, "");
  const isOld = /(^|[_-])(old|void)([_-]|$)/i.test(base);
  const expM = /_?exp[-_](\d{4}-\d{2}-\d{2})/i.exec(base);
  const expiry = expM ? expM[1] : null;
  const prefix = base.includes("_") ? base.split("_")[0] : null;
  const refM = /_([A-Za-z0-9][A-Za-z0-9\-/]{4,})(?=_|$)/.exec(base.replace(/_?exp[-_]\d{4}-\d{2}-\d{2}/i, "").replace(/[_-](old|void)/i, ""));
  const ref = refM ? refM[1] : null;
  return { prefix, expiry, isOld, ref };
}

export type Filing = {
  typeKey: string | null;
  typeLabel: string | null;
  category: DocCategory | null;
  shelf: DocShelf | null;
  ownerType: "company" | "person" | "either" | null;
  /** True if the catalogue type carries an expiry. */
  expires: boolean;
  /** Reliable expiry from the filename tag (if present). */
  expiry: string | null;
  isOld: boolean;
  companyReqKey?: string;
  personReqLabel?: string;
  pipeline?: string;
  prefix: string | null;
  ref: string | null;
};

/** The one function the intake AND the re-sort use: identify the type from the
 *  name (+ body as a weak hint), then derive everything from the catalogue, and
 *  read the reliable expiry/OLD markers from the filename. */
export function deriveFiling(fileName: string | null, title: string | null, body = ""): Filing {
  const name = `${fileName ?? ""} ${title ?? ""}`.trim();
  const parsed = parseConventionalName(fileName || title || "");
  const type = bestDocType(name, body);
  return {
    typeKey: type?.key ?? null,
    typeLabel: type?.label ?? null,
    category: type?.category ?? null,
    shelf: type?.shelf ?? null,
    ownerType: type?.ownerType ?? null,
    expires: type?.expires ?? false,
    expiry: parsed.expiry,
    isOld: parsed.isOld,
    companyReqKey: type?.companyReqKey,
    personReqLabel: type?.personReqLabel,
    pipeline: type?.pipeline,
    prefix: parsed.prefix,
    ref: parsed.ref,
  };
}
