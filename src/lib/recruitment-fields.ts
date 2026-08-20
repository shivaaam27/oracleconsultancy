// ─────────────────────────────────────────────────────────────────────────────
// What you can TYPE about a client, a candidate and a job order.
//
// One description of each form, used twice: by the "New …" panel on the list and
// by the record itself. Two hand-kept copies of the same form is how a field
// ends up creatable but not editable — which, on a desk where the salary drives
// the fee, is not a cosmetic problem.
//
// ⚠️ CLIENT-SAFE. Plain data and type-only imports, like `entity-view.ts`.
// The same rule and the same reason: no functions, so it could live in a table
// one day, and no `sb`, so the browser can read it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  JOB_STAGES, SENIORITIES, SENIORITY_LABELS, ORIGINS, ORIGIN_LABELS,
} from "@/lib/recruitment-shared";

export type FieldKind = "text" | "email" | "tel" | "number" | "money" | "date" | "select" | "textarea" | "toggle";

export type FormField = {
  key: string;
  label: string;
  kind: FieldKind;
  /** For `select`. The blank option is added automatically for optional ones. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** A line under the box. Use it to say what a figure MEANS, never to repeat the label. */
  hint?: string;
  required?: boolean;
  /** Span the whole width — notes, and anything long. */
  full?: boolean;
};

export type FormGroup = { id: string; title: string; fields: FormField[] };

const SENIORITY_OPTIONS = SENIORITIES.map((s) => ({ value: s, label: SENIORITY_LABELS[s] }));
const ORIGIN_OPTIONS = ORIGINS.map((o) => ({ value: o, label: ORIGIN_LABELS[o] }));
const STAGE_OPTIONS = JOB_STAGES.map((s) => ({ value: s, label: s }));

/* ─────────────────────────────────────────────────────────────── clients ── */

export const CLIENT_FORM: FormGroup[] = [
  {
    id: "who",
    title: "The employer",
    fields: [
      { key: "name", label: "Client", kind: "text", required: true, placeholder: "e.g. Sunflag Steel" },
      { key: "sector", label: "Sector", kind: "text", placeholder: "e.g. Cement and steel" },
      { key: "city", label: "City", kind: "text", placeholder: "e.g. Dar es Salaam" },
      { key: "contactName", label: "Contact", kind: "text" },
      { key: "contactEmail", label: "Email", kind: "email" },
      { key: "contactPhone", label: "Phone", kind: "tel" },
    ],
  },
  {
    id: "papers",
    title: "Papers signed",
    fields: [
      {
        key: "termsSignedOn", label: "Terms of Business", kind: "date",
        hint: "Signed once per client. Sourcing does not start before it.",
      },
      {
        key: "dsaSignedOn", label: "Data Sharing Agreement", kind: "date",
        hint: "What makes it lawful to send them a candidate's details.",
      },
    ],
  },
  {
    id: "ratio",
    title: "Head count",
    fields: [
      {
        key: "localEmployees", label: "Tanzanian staff", kind: "number",
        hint: "Their figure, not ours. Drives the 10:1 ratio a permit needs.",
      },
      { key: "foreignEmployees", label: "Foreign staff", kind: "number" },
    ],
  },
  {
    id: "notes",
    title: "Notes",
    fields: [{ key: "notes", label: "Anything worth remembering", kind: "textarea", full: true }],
  },
];

/* ──────────────────────────────────────────────────────────── candidates ── */

export const CANDIDATE_FORM: FormGroup[] = [
  {
    id: "who",
    title: "Who they are",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "title", label: "Current role", kind: "text", placeholder: "e.g. Maintenance Engineer" },
      { key: "sector", label: "Sector", kind: "text" },
      { key: "seniority", label: "Seniority", kind: "select", options: SENIORITY_OPTIONS },
      { key: "yearsExp", label: "Years of experience", kind: "number" },
      { key: "origin", label: "Sourced from", kind: "select", options: ORIGIN_OPTIONS },
      {
        key: "expectedSalaryUsd", label: "Expected monthly gross (USD)", kind: "money",
        hint: "Gross, not take-home. One month of it is the fee if they are placed.",
      },
      { key: "email", label: "Email", kind: "email" },
      { key: "phone", label: "Phone", kind: "tel" },
      { key: "partnerName", label: "Introduced by", kind: "text", placeholder: "India sourcing partner" },
    ],
  },
  {
    id: "travel",
    title: "Travel and identity",
    fields: [
      { key: "passportNo", label: "Passport number", kind: "text" },
      {
        key: "passportExpiry", label: "Passport expires", kind: "date",
        hint: "Must outlive the start date by six months.",
      },
      { key: "ecnr", label: "ECNR", kind: "toggle", hint: "Emigration Check Not Required." },
      { key: "idVerified", label: "Identity checked", kind: "toggle" },
    ],
  },
  {
    id: "papers",
    title: "Papers signed",
    fields: [
      {
        key: "consentSignedOn", label: "Registration & Consent", kind: "date",
        hint: "Without it there is no lawful basis for holding their CV.",
      },
      { key: "engagementSignedOn", label: "Terms of Engagement", kind: "date" },
    ],
  },
  {
    id: "notes",
    title: "Screening notes",
    fields: [
      {
        key: "notes", label: "What you found", kind: "textarea", full: true,
        hint: "What screening turned up. The per-role reasoning is written on the shortlist itself.",
      },
    ],
  },
];

/* ──────────────────────────────────────────────────────────── job orders ── */

export const JOB_ORDER_FORM: FormGroup[] = [
  {
    id: "brief",
    title: "The brief",
    fields: [
      { key: "title", label: "Role", kind: "text", required: true, placeholder: "e.g. Production Manager" },
      {
        key: "clientId", label: "Client", kind: "select",
        hint: "Leave blank if Oracle is hiring for itself — then there is no fee.",
      },
      { key: "sector", label: "Sector", kind: "text" },
      { key: "seniority", label: "Seniority", kind: "select", options: SENIORITY_OPTIONS },
      { key: "stage", label: "Stage", kind: "select", options: STAGE_OPTIONS },
    ],
  },
  {
    id: "money",
    title: "Salary and fee",
    fields: [
      {
        key: "monthlyGrossUsd", label: "Agreed monthly gross (USD)", kind: "money",
        hint: "Agreed in writing before the search starts — the fee is one month of it.",
        full: true,
      },
    ],
  },
  {
    id: "dates",
    title: "Dates",
    fields: [
      { key: "openedOn", label: "Opened", kind: "date" },
      { key: "signedOn", label: "Job Order signed", kind: "date" },
      { key: "targetStartOn", label: "Target start", kind: "date" },
      {
        key: "permitExpiry", label: "Permit expires", kind: "date",
        hint: "The client's permit, recorded here so the renewal is not missed. Oracle does not file it.",
      },
    ],
  },
  {
    id: "notes",
    title: "Notes",
    fields: [{ key: "notes", label: "Anything worth remembering", kind: "textarea", full: true }],
  },
];
