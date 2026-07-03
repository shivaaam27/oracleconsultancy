import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, numeric, jsonb, primaryKey, uniqueIndex, index, type AnyPgColumn } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  accentColor: text("accent_color"),
  // Two-letter prefix for task codes, e.g. "DS" → DS-001 (see migrate-task-codes).
  codePrefix: text("code_prefix"),
  // Brand short-name used to NAME documents ("DarSpices", "PES"). The `name` is the
  // legal name ("DSC Ltd"); this is the file prefix in the house naming format
  // `Prefix_DocType[_Ref][_EXP-date]`. Editable per company (migration 0103).
  filePrefix: text("file_prefix"),
  // Letterhead / branding — used by the system-wide letter generator. All optional.
  legalName: text("legal_name"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  registrationNo: text("registration_no"),
  tin: text("tin"),
  // VAT/VRN registration number + incorporation date (HR/compliance profile).
  vrn: text("vrn"),
  incorporationDate: timestamp("incorporation_date", { mode: "date", withTimezone: true }),
  logoPath: text("logo_path"),
  signatoryName: text("signatory_name"),
  signatoryTitle: text("signatory_title"),
  // Designed letterhead support. mode: "typed" (compose from fields + logo) |
  // "images" (header band + footer band) | "background" (full-page A4 image).
  letterheadMode: text("letterhead_mode").notNull().default("typed"),
  headerImagePath: text("header_image_path"),
  footerImagePath: text("footer_image_path"),
  backgroundImagePath: text("background_image_path"),
  // Body margins (mm) reserved for the design so text never overlaps the bands.
  contentTopMm: integer("content_top_mm"),
  contentBottomMm: integer("content_bottom_mm"),
  // Share capital totals (governance/cap-table) — issued is also derivable from
  // the sum of cap_table shares, but BRELA states both authorised and issued.
  authorisedShares: integer("authorised_shares"),
  issuedShares: integer("issued_shares"),
  // Alternative names/short forms (e.g. "Furaha", "DSC", "OCL") used to match a
  // company by document content or an uploaded folder name.
  aliases: jsonb("aliases").$type<string[]>(),
});

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

// Shared list of physical locations where staff live or work/are posted — e.g.
// "Matongo", "NLM", "Police Post", "Expat House A". NOT company branches; a
// place can host people from any company. Reused for people.work_site_id and
// people.residence_site_id (seeded from existing site_tools/asset locations).
export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
});

// Passkeys / Face ID / fingerprint sign-in (WebAuthn). One row per registered
// device. person_id null = the owner (admin) credential; otherwise a staff
// member's. We store only the PUBLIC key — the biometric never leaves the device.
export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").references((): AnyPgColumn => people.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(), // base64url
  publicKey: text("public_key").notNull(), // base64url of the COSE public key
  counter: doublePrecision("counter").notNull().default(0),
  transports: text("transports"), // comma-separated
  label: text("label"), // device name, e.g. "iPhone"
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date", withTimezone: true }),
});

// Managed list of job titles / roles — powers the role field's suggestions and
// lets duplicates be cleaned up. people.role stays free text (NOT a FK); a
// rename/merge here re-points people whose role text matches exactly.
export const jobTitles = pgTable("job_titles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
});

// Per-company department head: the same department name can have a different
// head in each company (e.g. Dar Spices Operations head ≠ PES Operations head).
export const departmentHeads = pgTable("department_heads", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  headPersonId: integer("head_person_id").references((): AnyPgColumn => people.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({ uniq: uniqueIndex("dept_head_company_dept").on(t.companyId, t.departmentId) }));

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  preferredChannel: text("preferred_channel"),
  role: text("role"),
  companyId: integer("company_id").references(() => companies.id),
  departmentId: integer("department_id").references(() => departments.id),
  managerId: integer("manager_id").references((): AnyPgColumn => people.id, { onDelete: "set null" }),
  // Employment start date (org/master data). Stored at UTC midnight (all-day).
  startDate: timestamp("start_date", { mode: "date", withTimezone: true }),
  // HR profile details (all optional; filled manually or auto-filled from intake).
  dateOfBirth: timestamp("date_of_birth", { mode: "date", withTimezone: true }),
  nationality: text("nationality"),
  nationalId: text("national_id"),
  passportNo: text("passport_no"),
  address: text("address"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  // End of probation period. Stored at UTC midnight (all-day).
  probationEndDate: timestamp("probation_end_date", { mode: "date", withTimezone: true }),
  contactStatus: text("contact_status"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  snoozedUntil: timestamp("snoozed_until", { mode: "date", withTimezone: true }),
  // Canonical HR types (see lib/person-types.ts): "local_staff" | "expat" |
  // "outsider" | "candidate". Legacy internal→local_staff, external→outsider.
  personType: text("person_type").notNull().default("local_staff"),
  // Soft self-reference: e.g. an immigration agent → the expat they are helping, or vice-versa.
  relatedPersonId: integer("related_person_id").references((): AnyPgColumn => people.id, { onDelete: "set null" }),
  // Staff portal sign-in (scrypt hash, set by the owner from Settings).
  // Null hash = no portal access. See src/lib/portal-auth.ts.
  portalPasswordHash: text("portal_password_hash"),
  portalEnabledAt: timestamp("portal_enabled_at", { mode: "date", withTimezone: true }),
  portalLastLoginAt: timestamp("portal_last_login_at", { mode: "date", withTimezone: true }),
  // "staff" (own tasks only), "manager" (own + direct reports' + own company's
  // tasks, may complete/pin), "hr" (admin/HR — every company's tasks) or
  // "director" (group-wide operator board). Only meaningful with access.
  portalRole: text("portal_role").notNull().default("staff"),
  // Optional display designation shown INSTEAD of the plain role label (portal
  // header + admin role badge) — e.g. a "manager" whose title reads "Group Admin
  // Manager". Cosmetic today; a hook for per-manager feature tiers later. NULL =
  // fall back to the default role label. See src/lib/portal-labels.ts.
  portalDesignation: text("portal_designation"),
  // Company-scoped director: when portalRole === "director" AND this is set, the
  // director's powers/board are limited to this ONE company (a "Company Director")
  // instead of the whole portfolio. NULL on a director = portfolio-wide (default).
  // Ignored for non-director roles. See lib/portal-auth.ts (scope helpers) +
  // memory/company_scoped_roles.md.
  directorCompanyId: integer("director_company_id").references(() => companies.id),
  // Comma-separated former staff IDs, stamped when the person moves company,
  // so old references (e.g. CZ-E04) stay traceable. See lib/staff-id.ts.
  previousStaffIds: text("previous_staff_ids"),
  // Explicit staff-ID category override: "director"|"manager"|"admin_hr"|
  // "employee". Null = derive the letter from the role text. See lib/staff-id.ts.
  staffCategory: text("staff_category"),
  // Where the person works/is posted, and where they live — shared `sites` list.
  workSiteId: integer("work_site_id").references((): AnyPgColumn => sites.id),
  residenceSiteId: integer("residence_site_id").references((): AnyPgColumn => sites.id),
});

// Additional company associations beyond a person's primary companyId, each with a
// relationship label (e.g. "Insurance broker", "Immigration agent"). Lets external
// contacts be linked to the companies they serve without being employed there.
export const personCompanies = pgTable(
  "person_companies",
  {
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    relationship: text("relationship"),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.companyId] }),
    index("person_companies_company_idx").on(t.companyId),
  ]
);

// Company-scoped director → the set of companies they govern. A director with
// one or more rows here is a "company director" limited to those companies; a
// director with NO rows is portfolio-wide (sees everything). Replaces the single
// people.director_company_id (which is kept in sync with the FIRST row for
// back-compat). Mirrors person_companies. See lib/portal-auth.ts.
export const directorCompanies = pgTable(
  "director_companies",
  {
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.companyId] }),
    index("director_companies_company_idx").on(t.companyId),
  ]
);

// Organogram — secondary / "dotted-line" reporting. The PRIMARY manager stays on
// people.manager_id (the solid line the org tree is drawn from). This table holds
// any ADDITIONAL managers a person also reports to (matrix / functional reporting),
// rendered as dotted lines. One row per extra (person → manager) pair.
export const reportingLines = pgTable(
  "reporting_lines",
  {
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    managerId: integer("manager_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    // Optional label for the relationship, e.g. "Functional", "Project", "Dotted".
    note: text("note"),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.managerId] }),
    index("reporting_lines_manager_idx").on(t.managerId),
  ]
);

// HR compliance — requirement profiles (one per person type) and their items.
// A profile lists the documents a person of that type must (or may) provide.
// Per-person checklists are snapshotted into person_requirements.
export const requirementProfiles = pgTable("requirement_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Canonical person type this profile applies to (lib/person-types.ts):
  // "local_staff" | "expat" | "outsider" | "candidate".
  appliesToType: text("applies_to_type").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

// The documents a profile requires. category maps to DOC_CATEGORIES so a saved
// document can satisfy the item. mandatory items count toward the 100% score.
export const requirementItems = pgTable("requirement_items", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => requirementProfiles.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  category: text("category"),
  mandatory: boolean("mandatory").notNull().default(true),
  expiryTracked: boolean("expiry_tracked").notNull().default(true),
  defaultLeadDays: integer("default_lead_days").notNull().default(30),
  helpText: text("help_text"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// A person's actual checklist — one row per required document, snapshotted from
// requirement_items so later profile edits don't silently rewrite history.
// status: missing | requested | received | verified | waived. The linked
// document satisfies the item; verification is a deliberate manual step.
export const personRequirements = pgTable(
  "person_requirements",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    itemId: integer("item_id").references(() => requirementItems.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    category: text("category"),
    mandatory: boolean("mandatory").notNull().default(true),
    expiryTracked: boolean("expiry_tracked").notNull().default(true),
    status: text("status").notNull().default("missing"),
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    // Set false once the operator manually unlinks a document, so the auto-linker
    // stops re-attaching a matching doc on every load. Manual linking still works.
    autoLink: boolean("auto_link").notNull().default(true),
    // Optional "valid until / review by" date for the requirement itself. Lets a
    // manually-verified item (no linked file) still lapse, so it can't count as
    // compliant forever. Derived expiring/expired folds into the effective status.
    reviewDate: timestamp("review_date", { mode: "date", withTimezone: true }),
    requestedAt: timestamp("requested_at", { mode: "date", withTimezone: true }),
    receivedAt: timestamp("received_at", { mode: "date", withTimezone: true }),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    verifiedBy: text("verified_by"),
    waivedReason: text("waived_reason"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("person_requirements_person_item_idx").on(t.personId, t.itemId),
    index("person_requirements_document_idx").on(t.documentId),
  ]
);

// Per-company document compliance checklist. Mirrors person_requirements, but
// companies have no shared template profiles — each company's list is its own.
// sourceKey identifies a seeded default item (e.g. "company-registration") so it
// can be reconciled/hidden without resurrection; custom items have sourceKey null
// and hard-delete on remove. category maps to DOC_CATEGORIES for doc auto-link.
export const companyRequirements = pgTable(
  "company_requirements",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sourceKey: text("source_key"),
    label: text("label").notNull(),
    category: text("category"),
    mandatory: boolean("mandatory").notNull().default(true),
    expiryTracked: boolean("expiry_tracked").notNull().default(true),
    status: text("status").notNull().default("missing"),
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    autoLink: boolean("auto_link").notNull().default(true),
    // Optional "valid until / review by" date — see person_requirements.reviewDate.
    reviewDate: timestamp("review_date", { mode: "date", withTimezone: true }),
    requestedAt: timestamp("requested_at", { mode: "date", withTimezone: true }),
    receivedAt: timestamp("received_at", { mode: "date", withTimezone: true }),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    verifiedBy: text("verified_by"),
    waivedReason: text("waived_reason"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("company_requirements_company_source_idx").on(t.companyId, t.sourceKey),
    index("company_requirements_document_idx").on(t.documentId),
  ]
);

// Append-only audit trail for document-compliance actions (verify, waive, link,
// etc.) on a person's OR a company's checklist. Keyed to the owner (person_id /
// company_id) so each record's history is queryable; `label` is snapshotted so
// the trail survives even if the underlying requirement row is later removed.
export const complianceEvents = pgTable(
  "compliance_events",
  {
    id: serial("id").primaryKey(),
    ownerType: text("owner_type").notNull(), // "person" | "company"
    personId: integer("person_id").references(() => people.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    // The person_requirements / company_requirements row id (no FK — two source
    // tables; kept for reference, may dangle after the row is deleted).
    requirementId: integer("requirement_id"),
    label: text("label").notNull(),
    action: text("action").notNull(), // verified | unverified | waived | unwaived | linked | unlinked | requested | added | edited | removed
    detail: text("detail"), // free-text context: waive reason, doc title, label change
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    createdBy: text("created_by"),
  },
  (t) => [
    index("compliance_events_person_idx").on(t.personId),
    index("compliance_events_company_idx").on(t.companyId),
  ]
);

// Append-only audit trail for a PERSON record — who changed which profile field
// (role, manager, contact, dates, type…), and archive/restore/enrich/snooze
// lifecycle actions. Mirrors compliance_events; old/new are snapshotted strings.
export const personEvents = pgTable(
  "person_events",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // created | updated | archived | restored | enriched | snoozed | unsnoozed
    field: text("field"), // human label of the changed field (for "updated")
    oldValue: text("old_value"),
    newValue: text("new_value"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    createdBy: text("created_by"),
  },
  (t) => [index("person_events_person_idx").on(t.personId)]
);

// Append-only FACT LEDGER (transfer-pack 03). A flexible, source-linked record of
// any verifiable fact about a company or person — salary, shareholding, directors,
// bank account, contract end, passport number, etc. The CURRENT value of an
// entity+field is the row with the latest `effectiveDate`; older rows are history.
// To record a change you ADD a new row — never edit or delete an old one.
// `value` is JSONB so it holds a number (salary), a string (bank account) or a
// list (directors/shareholding snapshot) without a rigid column per fact type.
export const facts = pgTable(
  "facts",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // "company" | "person"
    personId: integer("person_id").references(() => people.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    field: text("field").notNull(), // "Salary" | "Shareholding" | "Directors" | "Bank Account" | "Contract End" | …
    value: jsonb("value").notNull(), // number | string | array | object
    // A short human-readable rendering of `value`, so lists/UI never have to parse
    // JSON to show the fact. Kept in sync by the writer (recordFact).
    display: text("display"),
    effectiveDate: timestamp("effective_date", { mode: "date", withTimezone: true }).notNull(),
    source: text("source"), // e.g. "BRELA report", "Employment contract", "Payroll Jan 2026"
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    sourceHash: text("source_hash"), // hash of the proving file — mismatch ⇒ "re-verify"
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [
    index("facts_person_idx").on(t.personId),
    index("facts_company_idx").on(t.companyId),
    index("facts_field_idx").on(t.field),
  ]
);

// ── Governance & Risk (transfer-pack 03 §governance / §risks) ──────────────
// Board-level reference data: who owns what, who can sign, key-person risk, the
// risk register and the decisions log. Deliberately kept OUT of the daily/weekly
// surfaces (02 §8) — it appears only on company profiles (board view) and the
// monthly board pack. Seeded from governance.json / risks.json / decisions.json.

// Cap table — one row per shareholder per company. Authorised/issued totals live
// on the companies row (authorisedShares/issuedShares).
export const capTable = pgTable(
  "cap_table",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    holder: text("holder").notNull(),
    shares: integer("shares"),
    pct: doublePrecision("pct"),
    holderType: text("holder_type"), // "Person" | "Corporate"
    note: text("note"),
  },
  (t) => [index("cap_table_company_idx").on(t.companyId)]
);

// Ultimate beneficial owners — natural persons, with cross-company interests and
// a completeness flag (corporate shareholders needing look-through).
export const beneficialOwners = pgTable("beneficial_owners", {
  id: serial("id").primaryKey(),
  personName: text("person_name").notNull(),
  interests: text("interests"), // e.g. "DarSpices 48% · Oracle 99%"
  flag: text("flag"),
  complete: boolean("complete").notNull().default(true),
});

// Key-person concentration — how many companies one person directs/secretaries/
// owns/signs for; risk band Critical/Conflict/…
export const keyPersons = pgTable("key_persons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  directorOf: integer("director_of"),
  secretaryOf: integer("secretary_of"),
  shareholderOf: integer("shareholder_of"),
  signatoryOf: integer("signatory_of"),
  risk: text("risk"), // "Critical" | "Conflict" | "Low"
  note: text("note"),
});

// Signatory matrix — who can sign (bank/legal) for a company.
export const signatories = pgTable(
  "signatories",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scope: text("scope"), // "Bank" | "Legal" | "All" (free text)
    note: text("note"),
  },
  (t) => [index("signatories_company_idx").on(t.companyId)]
);

// Board resolutions log.
export const resolutions = pgTable(
  "resolutions",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    date: timestamp("date", { mode: "date", withTimezone: true }),
    type: text("type"), // "Special Resolution" | "Board Resolution" | …
    summary: text("summary").notNull(),
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    file: text("file"), // legacy file path from the local engine
  },
  (t) => [index("resolutions_company_idx").on(t.companyId)]
);

// Risk register — structural risks scored L×I, plus a band. Operational risks are
// still computed live elsewhere; these are the standing structural ones.
export const risks = pgTable("risks", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. "R-INFRA-01"
  category: text("category"),
  title: text("title").notNull(),
  description: text("description"),
  likelihood: integer("likelihood"), // 1..3
  impact: integer("impact"), // 1..3
  owner: text("owner"),
  mitigation: text("mitigation"),
  status: text("status").notNull().default("Open"),
  linked: text("linked"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }),
});

// In-flight bureaucracy pipeline (transfer-pack 03 §processes): permits/visas/
// licence/lease/tax-clearance renewals moving through government stages. A small
// kanban so nothing stalls mid-application unnoticed.
export const pipeline = pgTable(
  "pipeline",
  {
    id: serial("id").primaryKey(),
    subject: text("subject").notNull(), // the person or thing the case is about
    subjectType: text("subject_type"), // "Person" | "Company"
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
    type: text("type").notNull(), // "Work Permit (Class C)", "Residence Permit", …
    stage: text("stage").notNull().default("To Apply"), // see PIPELINE_STAGES
    controlNo: text("control_no"),
    amount: text("amount"), // free text (fees vary in format/currency)
    lastUpdate: timestamp("last_update", { mode: "date", withTimezone: true }),
    deadline: timestamp("deadline", { mode: "date", withTimezone: true }),
    nextAction: text("next_action"),
    owner: text("owner"),
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    // The task that DRIVES this application (its "next action" as a tracked task).
    // Completing that task auto-advances this case one stage (automation cascade).
    taskId: integer("task_id").references((): AnyPgColumn => tasks.id, { onDelete: "set null" }),
    file: text("file"), // legacy file path from the local engine
    notes: text("notes"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull().default("web-ui"),
  },
  (t) => [index("pipeline_company_idx").on(t.companyId), index("pipeline_stage_idx").on(t.stage)]
);

// Commitments register (transfer-pack 03 §registers): leases, insurance policies
// and commercial contracts — the standing obligations whose RENEWAL/NOTICE dates
// matter. Drives a commitments calendar: notice-by = end_date − notice_days, so a
// lease auto-renewal or an insurance lapse is flagged before it bites. (Assets &
// vendors already live in their own tables; this covers the rest.)
export const commitments = pgTable(
  "commitments",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // "lease" | "insurance" | "contract"
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    counterparty: text("counterparty"), // landlord / insurer / other party
    reference: text("reference"), // policy no. / title ref
    startDate: timestamp("start_date", { mode: "date", withTimezone: true }),
    endDate: timestamp("end_date", { mode: "date", withTimezone: true }),
    noticeDays: integer("notice_days"),
    amount: text("amount"), // rent / premium / contract value (free text)
    status: text("status").notNull().default("active"), // active | needs_doc | quoting | partial | expired
    note: text("note"),
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull().default("web-ui"),
  },
  (t) => [index("commitments_company_idx").on(t.companyId), index("commitments_kind_idx").on(t.kind)]
);

// Board decisions / approvals log.
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. "D-2026-001"
  title: text("title").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  type: text("type"),
  raisedBy: text("raised_by"),
  due: timestamp("due", { mode: "date", withTimezone: true }),
  status: text("status").notNull().default("Pending"),
  context: text("context"),
  decision: text("decision"),
  decidedOn: timestamp("decided_on", { mode: "date", withTimezone: true }),
});

// Editable onboarding/offboarding step templates, per person type. A person's
// journey (todos tagged with `kind`) is created from / synced to these rows.
// kind: "onboarding" | "offboarding"; appliesToType matches person-types.ts.
// offsetDays = days from the anchor date (start date for onboarding, today for
// offboarding) used to seed each step's due date.
export const journeyStepTemplates = pgTable("journey_step_templates", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  appliesToType: text("applies_to_type").notNull(),
  label: text("label").notNull(),
  offsetDays: integer("offset_days").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  departmentId: integer("department_id").references(() => departments.id),
  meetingDate: timestamp("meeting_date", { mode: "date", withTimezone: true }),
  actionItem: text("action_item").notNull(),
  ownerId: integer("owner_id").references(() => people.id),
  createdDate: timestamp("created_date", { mode: "date", withTimezone: true }),
  deadline: timestamp("deadline", { mode: "date", withTimezone: true }),
  status: text("status").notNull().default("Not Started"),
  priority: text("priority").notNull().default("Low"),
  category: text("category"),
  risk: text("risk"),
  escalation: text("escalation").default("No"),
  comments: text("comments"),
  latestUpdate: text("latest_update"),
  lastUpdatedAt: timestamp("last_updated_at", { mode: "date", withTimezone: true }),
  closedDate: timestamp("closed_date", { mode: "date", withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  // Previous task code (e.g. "CO01-008") kept after the DS-001 rename so old
  // /task/<code> links still resolve. Null for tasks created after the rename.
  legacyCode: text("legacy_code"),
  // Who raised the task (the person, when known). Set for portal-created tasks
  // (manager/director/HR); null for owner/web-ui created tasks. Powers the
  // "raised by" column and the "Tasks I assigned" portal view.
  createdByPersonId: integer("created_by_person_id").references(() => people.id),
  // When true, completing or closing this task requires an attachment (proof) —
  // enforced server-side in the portal completion gate.
  requiresAttachment: boolean("requires_attachment").notNull().default(false),
  // When true, ONLY the person who created the task (createdByPersonId — typically
  // the director who assigned it) may move it to Completed/Closed. Other portal
  // roles can still progress/update it but not close it. The owner/admin always
  // overrides. Default ON for director-created tasks; off elsewhere. Enforced
  // server-side in the portal completion + edit gates.
  creatorCloseOnly: boolean("creator_close_only").notNull().default(false),
  // KPI accountability mode for overdue blame (completion credit is ALWAYS shared
  // across everyone involved — this only governs who carries an OVERDUE penalty):
  //   "shared" — every assignee/owner/lead shares the overdue hit (default).
  //   "lead"   — only the accountable lead(s) carry it; helpers are spared.
  // See src/lib/kpi.ts.
  accountability: text("accountability").notNull().default("shared"),
  // Documented blocker ("Waiting on <person>"): while set, the task's overdue
  // penalty is fully SUSPENDED for everyone (the situation is on record for the
  // owner to judge). blockedReason is required when raising it; blockedSince
  // timestamps the handoff for the audit trail.
  blockedOnPersonId: integer("blocked_on_person_id").references(() => people.id),
  blockedReason: text("blocked_reason"),
  blockedSince: timestamp("blocked_since", { mode: "date", withTimezone: true }),
  // Set when this task was spawned from a calendar event (meeting-as-task). Lets
  // the drawer show a "from meeting" chip and the sweep advance it at start time.
  sourceEventId: integer("source_event_id").references((): AnyPgColumn => calendarEvents.id, { onDelete: "set null" }),
}, (t) => [
  index("tasks_company_idx").on(t.companyId),
  index("tasks_owner_idx").on(t.ownerId),
  index("tasks_status_idx").on(t.status),
  index("tasks_created_by_idx").on(t.createdByPersonId),
  index("tasks_source_event_idx").on(t.sourceEventId),
]);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    // "accountable" (answers for the task) or "working" (doing the task).
    // tasks.owner_id remains the FIRST accountable person for back-compat;
    // additional accountable people are assignees with this role.
    role: text("role").notNull().default("working"),
    // Per-person "my part is done" stamp. When set, this person is spared the
    // task's overdue penalty (they delivered their portion) — see src/lib/kpi.ts.
    partDoneAt: timestamp("part_done_at", { mode: "date", withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.personId] }),
    index("task_assignees_person_idx").on(t.personId),
  ]
);

// Web-push device subscriptions per recipient ("admin" or "person:<id>").
// Powers push-to-phone for the notification bell (T4b). The owner's older
// overdue-alert push still uses the settings blob in lib/push.ts.
export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  recipient: text("recipient").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
});

// In-app notifications (T4). Recipient is "admin" (the owner) or
// "person:<id>" (a portal user), matching the task_views convention.
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipient: text("recipient").notNull(),
  kind: text("kind").notNull(), // mention | reply | pinned | assigned | chat | chat_mention | leave | announcement | request
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  taskCode: text("task_code"),
  // Chat deep-link target (kind chat / chat_mention). Null for task notifs.
  threadId: integer("thread_id").references((): AnyPgColumn => chatThreads.id, { onDelete: "cascade" }),
  // Request deep-link target (kind request). Null for non-request notifs.
  requestId: integer("request_id").references((): AnyPgColumn => requests.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  actor: text("actor"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  readAt: timestamp("read_at", { mode: "date", withTimezone: true }),
}, (t) => [index("notifications_recipient_idx").on(t.recipient)]);

// People @mentioned in an update — drives highlight now, notifications in T4.
export const updateMentions = pgTable(
  "update_mentions",
  {
    updateId: integer("update_id").notNull().references(() => taskUpdates.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.updateId, t.personId] })]
);

// Read-receipts for a specific update (used for pinned instructions): a
// person taps "Understood" and we record it, so managers/the owner can see
// who has acknowledged without chasing.
export const updateAcks = pgTable(
  "update_acks",
  {
    updateId: integer("update_id").notNull().references(() => taskUpdates.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    acknowledgedAt: timestamp("acknowledged_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.updateId, t.personId] })]
);

// Who last viewed a task and when — powers the "Seen" indicator. Viewer is
// "admin" (the owner's command centre) or "person:<id>" (a portal user).
export const taskViews = pgTable(
  "task_views",
  {
    taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    viewer: text("viewer").notNull(),
    lastViewedAt: timestamp("last_viewed_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.viewer] })]
);

export const taskUpdates = pgTable("task_updates", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by"),
  /** Set on first edit; preserves the original text for history. */
  originalBody: text("original_body"),
  /** Timestamp of most recent edit (null = never edited). */
  editedAt: timestamp("edited_at", { mode: "date", withTimezone: true }),
  /** Soft-delete marker; rows with this set are hidden from timelines. */
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
  /** When set, sort this update to the top of its task's timeline. */
  pinnedAt: timestamp("pinned_at", { mode: "date", withTimezone: true }),
  /** Reply target: the update this one is answering (one level only — no
   *  nested threads). Null for top-level messages. (T2 conversation.) */
  parentUpdateId: integer("parent_update_id").references((): AnyPgColumn => taskUpdates.id, { onDelete: "set null" }),
  /** Optional file attached to this message — stored as a real `documents`
   *  row (so it appears in the Documents centre and is linked to the task). */
  attachmentDocumentId: integer("attachment_document_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
}, (t) => [index("task_updates_task_idx").on(t.taskId)]);

/* ------------------------------------------------------------------ *
 * Chat — free-standing messaging, separate from task `task_updates`.
 * Participants use the same string convention as notifications/task_views:
 * "admin" (the owner) or "person:<id>" (a portal user).
 * ------------------------------------------------------------------ */

// A conversation. `dm` = 1:1 (deduped via dmKey), `group` = ad-hoc many.
export const chatThreads = pgTable("chat_threads", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("dm"), // dm | group
  title: text("title"), // null for DMs (derived from the other participant)
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  // Stable key for DM dedup: sorted participant pair, e.g. "admin|person:5".
  dmKey: text("dm_key"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  // Denormalised for inbox sort; bumped on every send.
  lastMessageAt: timestamp("last_message_at", { mode: "date", withTimezone: true }),
  archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
}, (t) => [uniqueIndex("chat_threads_dm_key_idx").on(t.dmKey)]);

export const chatParticipants = pgTable(
  "chat_participants",
  {
    threadId: integer("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
    participant: text("participant").notNull(), // "admin" | "person:<id>"
    role: text("role").notNull().default("member"), // member | owner
    joinedAt: timestamp("joined_at", { mode: "date", withTimezone: true }).notNull(),
    lastReadAt: timestamp("last_read_at", { mode: "date", withTimezone: true }),
    mutedAt: timestamp("muted_at", { mode: "date", withTimezone: true }),
    // "Delete conversation for me" — hides the thread from this participant's
    // list. A newer message (last_message_at > hidden_at) brings it back.
    hiddenAt: timestamp("hidden_at", { mode: "date", withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.participant] }),
    index("chat_participants_participant_idx").on(t.participant),
  ]
);

// "Delete message for me" — hide a single message for one participant only.
export const chatMessageHidden = pgTable(
  "chat_message_hidden",
  {
    messageId: integer("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
    participant: text("participant").notNull(),
    hiddenAt: timestamp("hidden_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.participant] })]
);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(), // "admin" | "person:<id>"
  body: text("body").notNull().default(""),
  // Uploaded files, same shape as inbox bundles: [{ name, path, type, size }].
  attachments: text("attachments"), // JSON string
  // Optional reference to a task (cite + jump to /task/<code>).
  taskCode: text("task_code"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  editedAt: timestamp("edited_at", { mode: "date", withTimezone: true }),
  originalBody: text("original_body"),
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
}, (t) => [index("chat_messages_thread_idx").on(t.threadId)]);

// People @mentioned in a chat message — mirrors update_mentions.
export const chatMessageMentions = pgTable(
  "chat_message_mentions",
  {
    messageId: integer("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.personId] })]
);

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  meetingDate: timestamp("meeting_date", { mode: "date", withTimezone: true }).notNull(),
  attendees: text("attendees"),
  rawNotes: text("raw_notes").notNull().default(""),
  minutes: text("minutes"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
  // "meeting" (default) or "note" — lets meetings and Apple-Notes-style notes
  // share this table while the Workbook shows them in separate tabs.
  kind: text("kind").notNull().default("meeting"),
  // Notes: pin to top + optional folder for organisation.
  pinnedAt: timestamp("pinned_at", { mode: "date", withTimezone: true }),
  folder: text("folder"),
});

export const meetingTasks = pgTable(
  "meeting_tasks",
  {
    meetingId: integer("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.taskId] })]
);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  externalId: text("external_id"),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  taskCode: text("task_code"),
  companyId: integer("company_id").references(() => companies.id),
  entryType: text("entry_type"),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by"),
  /** Soft-delete marker. Hidden from timelines + /audit by default; toggleable. */
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
});

export const corrections = pgTable("corrections", {
  id: serial("id").primaryKey(),
  auditLogId: integer("audit_log_id").references(() => auditLog.id),
  correctedByEntryId: integer("corrected_by_entry_id").references(() => auditLog.id),
  status: text("status").notNull().default("Open"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
});

export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
    personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    messageType: text("message_type"),
    escalationLevel: text("escalation_level"),
    sentAt: timestamp("sent_at", { mode: "date", withTimezone: true }),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("reminders_dedupe_idx").on(t.dedupeKey)]
);

export const outbox = pgTable("outbox", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(),
  recipientName: text("recipient_name"),
  recipientContact: text("recipient_contact"),
  company: text("company"),
  subject: text("subject"),
  body: text("body").notNull(),
  messageType: text("message_type"),
  status: text("status").notNull().default("Ready"),
  contactStatus: text("contact_status"),
  notes: text("notes"),
  // Persisted-draft support: where the message came from + links back to source.
  source: text("source"), // "task" | "todo" | "adhoc"
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  todoId: integer("todo_id").references(() => todos.id, { onDelete: "set null" }),
  scheduledFor: timestamp("scheduled_for", { mode: "date", withTimezone: true }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { mode: "date", withTimezone: true }),
}, (t) => [index("outbox_person_idx").on(t.personId)]);

export const dailySnapshots = pgTable(
  "daily_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotDate: timestamp("snapshot_date", { mode: "date", withTimezone: true }).notNull(),
    companyId: integer("company_id").references(() => companies.id),
    total: integer("total").notNull().default(0),
    open: integer("open").notNull().default(0),
    overdue: integer("overdue").notNull().default(0),
    dueSoon: integer("due_soon").notNull().default(0),
    blocked: integer("blocked").notNull().default(0),
    critical: integer("critical").notNull().default(0),
    escalated: integer("escalated").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    closed: integer("closed").notNull().default(0),
    riskScore: doublePrecision("risk_score").notNull().default(0),
  },
  (t) => [uniqueIndex("daily_snapshots_company_date_idx").on(t.companyId, t.snapshotDate)]
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const systemEvents = pgTable("system_events", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),         // "cron.snapshots" | "cron.cleanup" | "dispatch" | "error" | "heartbeat"
  status: text("status").notNull(),     // "ok" | "error" | "skip"
  details: text("details"),             // JSON string, free-form
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
});

export const undoTokens = pgTable("undo_tokens", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  taskId: integer("task_id"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { mode: "date", withTimezone: true }),
});

// Conversational memory for Ask COS (and any future assistant surface). Stores
// past Q&A ("qa"), learned working preferences ("preference"), and stable facts
// ("fact") per recipient ("admin" = owner; a staff name on portal surfaces).
// Recall is cheap + deterministic (recency + keyword overlap in src/lib/ai-memory.ts,
// no AI call). Read/written via supabase-js. See migration 0095.
export const aiMemory = pgTable("ai_memory", {
  id: serial("id").primaryKey(),
  recipient: text("recipient").notNull().default("admin"),
  kind: text("kind").notNull(),          // "qa" | "preference" | "fact"
  question: text("question"),
  answer: text("answer"),
  tags: text("tags"),                    // free-form, comma-joined topic tags
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_memory_recipient_created_idx").on(t.recipient, t.createdAt)]);

// AI usage ledger. One row per successful Groq call (written best-effort,
// fire-and-forget from src/lib/ai-json.ts): model, source ("ask"/"extract"/
// "translate"/…), token counts and an estimated cost. est_cost defaults to 0
// because the Groq free tier is free today; set a per-model rate + a monthly
// spend cap (settings) to make the ledger drive a graceful AI-off when over
// budget. Read/written via supabase-js. See migration 0096 + src/lib/ai-spend.ts.
export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  model: text("model"),
  source: text("source"),                  // call-site label, e.g. "ask" | "extract" | "translate"
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  estCost: numeric("est_cost", { precision: 12, scale: 4 }).default("0"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_usage_at_idx").on(t.at)]);

// Inbound capture queue: forwarded emails and shared WhatsApp items land here as
// "pending" until filed (into a task or a note) or dismissed via the Capture Wizard.
export const inbox = pgTable("inbox", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),                    // "email" | "whatsapp" | "share" | "manual"
  status: text("status").notNull().default("pending"), // "pending" | "filed" | "dismissed"
  sender: text("sender"),                              // email address / contact name
  subject: text("subject"),                            // email subject / short label
  body: text("body").notNull(),                        // the captured text
  attachments: text("attachments"),                    // JSON: [{name,url,type}]
  filedKind: text("filed_kind"),                       // "task" | "note"
  filedRef: text("filed_ref"),                         // task code or meeting id
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  filedAt: timestamp("filed_at", { mode: "date", withTimezone: true }),
});

// Personal checklist — lightweight to-dos the operator adds in the Workbook,
// separate from company tasks. Optionally linked to a company and/or a task.
export const todos = pgTable("todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  important: boolean("important").notNull().default(false),
  // Tags a to-do as part of a person journey: "onboarding" | "offboarding".
  // NULL for ordinary personal to-dos. Lets the drawer group/progress steps
  // and prevents duplicate generation, while steps still live in the to-do system.
  kind: text("kind"),
  // Ordering within a generated journey checklist (0-based); NULL for ad-hoc to-dos.
  sortOrder: integer("sort_order"),
  dueAt: timestamp("due_at", { mode: "date", withTimezone: true }),
  // When set, this to-do is a "reminder": it fires a timed push (cron) and shows
  // in the morning digest. NULL = an ordinary to-do (no ping). `pushed` dedupes.
  remindAt: timestamp("remind_at", { mode: "date", withTimezone: true }),
  pushed: boolean("pushed").notNull().default(false),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
}, (t) => [index("todos_person_idx").on(t.personId), index("todos_remind_idx").on(t.done, t.remindAt)]);

// Director Brief notes — free narrative the operator writes by hand: Admin/HR
// "updates" that aren't tasks (e.g. "Renewed the office lease", "Onboarded two
// cleaners"). They show in the brief between Delivered and Open work, and in the
// share text/PDF. `noteDate` decides which period's brief a note appears in
// (same window logic as Delivered); `companyId` is optional (NULL = portfolio).
export const briefNotes = pgTable("brief_notes", {
  id: serial("id").primaryKey(),
  body: text("body").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  noteDate: timestamp("note_date", { mode: "date", withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

// Calendar events — a standalone, app-owned calendar. Each event can generate
// an .ics file (the universal calendar format every mail/calendar app reads) so
// recipients' own calendars save it automatically, plus an optional Google Meet
// link. Times are stored as timestamptz (UTC); all-day events use `allDay`.
// `attendees` is a JSON array of { personId?, name, email? } so we know who to
// send to and how. `source` discriminates manual vs derived (meeting/task).
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  // Where: a physical place OR a meeting URL. `meetLink` is the canonical
  // video link; `location` is free text for in-person events.
  location: text("location"),
  meetLink: text("meet_link"),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  startAt: timestamp("start_at", { mode: "date", withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { mode: "date", withTimezone: true }),
  allDay: boolean("all_day").notNull().default(false),
  // Minutes before start to fire a reminder (VALARM in the .ics + in-app). NULL = none.
  // Kept for back-compat / single-reminder reads; `reminders` is the source of truth.
  reminderMinutes: integer("reminder_minutes"),
  // JSON array of minutes-before for multiple reminders, e.g. [1440, 60].
  reminders: text("reminders"),
  // Recurrence: "none" | "daily" | "weekly" | "monthly". NULL/"none" = one-off.
  recurrence: text("recurrence"),
  // Last day the recurrence repeats (inclusive). NULL = no end (capped on read).
  recurrenceUntil: timestamp("recurrence_until", { mode: "date", withTimezone: true }),
  // JSON array: [{ personId?: number, name: string, email?: string }]
  attendees: text("attendees"),
  // "manual" | "meeting" | "task" — keeps provenance for back-links.
  source: text("source").notNull().default("manual"),
  meetingId: integer("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  // Stable UID used in the .ics so re-sends update (not duplicate) the event in
  // the recipient's calendar. Set once at creation.
  uid: text("uid").notNull(),
  // Bumps each time the event is edited; written into the .ics SEQUENCE so
  // calendars treat a re-send as an update to the same event.
  sequence: integer("sequence").notNull().default(0),
  status: text("status").notNull().default("confirmed"), // confirmed | cancelled
  // Google Calendar event id (set once the event is pushed to Google). Lets a
  // later COS edit/cancel patch/delete the same Google event so guests are told.
  googleEventId: text("google_event_id"),
  createdBy: text("created_by").notNull().default("web-ui"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
}, (t) => [
  index("calendar_events_start_idx").on(t.startAt),
  index("calendar_events_company_idx").on(t.companyId),
]);

// Compliance & Documents centre — tracks licences, contracts, certificates,
// registrations, insurance, leases, permits, immigration/visas, tax filings, etc.
// Owner decision: track details only (file_url is an optional link to where the
// file lives, e.g. Drive/email); company + optional person ownership. Status is
// DERIVED at read time (Valid / Expiring soon / Expired / No expiry), never stored.
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  // Most documents belong to a company; some also (or instead) to a person
  // (e.g. an expat's passport/visa). Either or both may be set.
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  // Licence | Contract | Certificate | Registration | Insurance | Lease | Permit
  // | Immigration | Tax | Other.
  category: text("category"),
  // Free-text specific type, e.g. "Trade Licence", "Work Permit", "TIN".
  docType: text("doc_type"),
  issuer: text("issuer"),
  referenceNo: text("reference_no"),
  issueDate: timestamp("issue_date", { mode: "date", withTimezone: true }),
  expiryDate: timestamp("expiry_date", { mode: "date", withTimezone: true }),
  // How many days before expiry the reminder engine should start nudging.
  reminderLeadDays: integer("reminder_lead_days").notNull().default(30),
  // Optional link to where the actual file lives (Drive/email).
  fileUrl: text("file_url"),
  // In-app uploaded file (Supabase Storage, private "documents" bucket):
  // storagePath is the object key; fileName is the original name for display.
  storagePath: text("storage_path"),
  fileName: text("file_name"),
  notes: text("notes"),
  // Optional link to the vendor this document belongs to (e.g. a supplier
  // contract or a service agreement). Lets vendor contracts reuse the
  // documents expiry/compliance engine.
  vendorId: integer("vendor_id").references((): AnyPgColumn => vendors.id, { onDelete: "set null" }),
  // Renewal lineage: the (now-archived) document this one replaces. Lets the UI
  // show "Replaces …" / "Replaced by …" so a renewable document's history is clear.
  supersedesId: integer("supersedes_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
  // Intake confidence gate (transfer-pack 08): "ok" once auto-filled or human
  // -confirmed; "needs_review" when the AI scan was low-confidence / unmatched
  // company — those sit in the Needs-review queue until a one-tap confirm.
  reviewStatus: text("review_status").notNull().default("ok"),
  // `_NEEDORIG` (transfer-pack 02 §6): set when the file is only a photo/scan
  // standing in for an official original still to be collected. The Safety Net
  // raises an "Awaiting original" finding while this is true.
  needsOriginal: boolean("needs_original").notNull().default(false),
  // SHA-256 of the uploaded file's bytes — lets dedup catch the SAME file
  // re-uploaded even under a different name/owner (not just same owner+category).
  fileHash: text("file_hash"),
  // When a human has reviewed/confirmed this document (saved it, confirmed it out
  // of the review queue, or approved/skipped a re-scan). The re-scan tool SKIPS
  // vetted documents by default — so the AI only re-reads what you haven't settled,
  // which is what makes re-scanning converge instead of churning new "discoveries".
  vettedAt: timestamp("vetted_at", { mode: "date", withTimezone: true }),
  // When one uploaded file (e.g. a recruit's scanned bundle) is split into
  // several documents, every split shares one compilationId and stores the page
  // range it covers ("1-3"). The original file is stored once and shared.
  compilationId: text("compilation_id"),
  pageRange: text("page_range"),
  // Expiry intelligence: "yes" = this document type genuinely expires (renew on
  // expiryDate); "no" = it has no expiry by nature (CV, invoice, analytical) —
  // so a blank expiry is correct, not missing; null = not yet determined.
  expiryKind: text("expiry_kind"),
  // Intake bucket (auto-sorter): "filed" = in the live library; "quarantine" =
  // the sorter couldn't settle it (no owner / unreadable / suspected duplicate),
  // held for a glance; "trash" = a certain duplicate or a copy superseded by a
  // better one (e.g. a photo replaced by a PDF). Quarantine/trash rows also carry
  // archived=true so every active query/compliance scorer already hides them.
  intakeState: text("intake_state").notNull().default("filed"),
  // Plain-language reason a row sits in quarantine/trash (shown in those views).
  intakeReason: text("intake_reason"),
  // How sure the AI read was (0–1), from the extraction. Drives the confidence
  // badge + the "unsure, please check" lane; null = no AI read (manual entry).
  confidence: doublePrecision("confidence"),
  // When the row was moved to trash — the Trash view sorts by it. Trash is never
  // emptied automatically (owner empties it); this is just for ordering/age.
  trashedAt: timestamp("trashed_at", { mode: "date", withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
}, (t) => [
  index("documents_company_idx").on(t.companyId),
  index("documents_person_idx").on(t.personId),
  index("documents_vendor_idx").on(t.vendorId),
  index("documents_file_hash_idx").on(t.fileHash),
]);

// Automation reaction log (V3 "the system moves on its own"). When a document is
// filed, the reaction layer advances the processes it touches — verifies a matching
// compliance item, completes a linked task, advances a pipeline stage, ticks an
// onboarding step. CERTAIN matches are applied automatically; fuzzier ones are
// recorded as suggestions for a one-click Apply. EVERY action is logged here with
// enough to UNDO it (prev_value), so a self-moving system stays visible + reversible.
export const automationEvents = pgTable("automation_events", {
  id: serial("id").primaryKey(),
  // What moved: compliance-verify | task-complete | pipeline-advance | onboarding-tick.
  kind: text("kind").notNull(),
  // applied = done automatically (certain); suggested = pending a one-click Apply.
  // Transitions: suggested → applied | dismissed; applied → undone.
  status: text("status").notNull().default("suggested"),
  // The document whose filing triggered this reaction.
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  // The row that was (or would be) changed, for apply + undo.
  targetTable: text("target_table").notNull(), // person_requirements | company_requirements | tasks | pipeline | todos
  targetId: integer("target_id").notNull(),
  // For display/grouping.
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  summary: text("summary").notNull(), // human line, e.g. "Verified Passport for John"
  detail: text("detail"),             // why it matched
  prevValue: text("prev_value"),      // state before the move (for undo)
  newValue: text("new_value"),        // state after the move
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  actedAt: timestamp("acted_at", { mode: "date", withTimezone: true }), // applied/undone/dismissed at
  createdBy: text("created_by").notNull().default("automation"),
}, (t) => [
  index("automation_events_status_idx").on(t.status),
  index("automation_events_document_idx").on(t.documentId),
]);

// Profile suggestions ("the system tells you what to add"). When a document is
// filed, the AI's structured read (profile fields, ledger facts) is proposed here
// rather than written silently — the owner accepts/dismisses on the company or
// person profile. Always-ask-first sibling of automation_events (which moves
// processes); this one fills RECORDS. Accept writes through to the real table.
export const profileSuggestions = pgTable("profile_suggestions", {
  id: serial("id").primaryKey(),
  // What to add: company-field | person-field | fact.
  kind: text("kind").notNull(),
  // pending → accepted | dismissed.
  status: text("status").notNull().default("pending"),
  // The document whose filing produced this suggestion.
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  personId: integer("person_id").references(() => people.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  // The target field. For company-field/person-field this is the profile key
  // (e.g. "registrationNo"); for fact it is the ledger field (e.g. "Directors").
  field: text("field").notNull(),
  // Proposed value (string/number/array/object — facts can be lists).
  value: jsonb("value").notNull(),
  display: text("display"),        // human rendering of value
  summary: text("summary").notNull(), // "Add Registration no. 12345 to Dar Spices"
  detail: text("detail"),             // where it came from, e.g. the file title
  effectiveDate: timestamp("effective_date", { mode: "date", withTimezone: true }), // for facts
  source: text("source"),             // proving source label (for facts)
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  actedAt: timestamp("acted_at", { mode: "date", withTimezone: true }),
  createdBy: text("created_by").notNull().default("ai-intake"),
}, (t) => [
  index("profile_suggestions_status_idx").on(t.status),
  index("profile_suggestions_company_idx").on(t.companyId),
  index("profile_suggestions_person_idx").on(t.personId),
  index("profile_suggestions_document_idx").on(t.documentId),
]);

// Learning loop (Part C): when the owner corrects a filed document's category
// (the intake guessed the wrong shelf), the fix is remembered here so the next
// similar document follows the correction. Keyed by a small set of distinctive
// keywords read off the title/issuer; `hits` grows each time the same fix recurs.
export const routingCorrections = pgTable("routing_corrections", {
  id: serial("id").primaryKey(),
  keywords: text("keywords").notNull(),       // comma-joined distinctive tokens
  toCategory: text("to_category").notNull(),  // the category the owner chose
  sampleTitle: text("sample_title"),          // an example, for transparency
  hits: integer("hits").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }),
}, (t) => [index("routing_corrections_keywords_idx").on(t.keywords)]);

// Owner-correction memory (self-learning): when the owner assigns/corrects a
// document's owner, remember it keyed by the document's distinctive words, so the
// next similar document resolves to that company/person on its own. Sibling of
// routing_corrections (which learns category); this learns the OWNER.
export const ownerCorrections = pgTable("owner_corrections", {
  id: serial("id").primaryKey(),
  keywords: text("keywords").notNull(),      // comma-joined distinctive tokens
  ownerType: text("owner_type").notNull(),   // "company" | "person"
  ownerId: integer("owner_id").notNull(),
  sampleTitle: text("sample_title"),
  hits: integer("hits").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }),
}, (t) => [index("owner_corrections_keywords_idx").on(t.keywords)]);

// Custom shelves (Part D): the owner's eight built-in folders can be extended.
// A genuinely new kind of document (e.g. a Trademark certificate) is PROPOSED as
// a new shelf (a profile_suggestions row, kind "new-shelf"); accepting inserts a
// row here. Documents route to a custom shelf when their text matches `keywords`.
export const customShelves = pgTable("custom_shelves", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull(),               // display prefix, e.g. "09"
  keywords: text("keywords").notNull(),       // comma-joined match terms
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

// Extraction memory: the AI's structured read of a file, keyed by the file's
// CONTENT hash. Reading the same bytes again returns this cached result with no
// Groq call — so re-scanning an unchanged document is free AND deterministic
// (the same answer every time), instead of the LLM inventing fresh diffs each run.
export const extractionCache = pgTable("extraction_cache", {
  fileHash: text("file_hash").primaryKey(),
  result: text("result").notNull(), // JSON of the ExtractResult (minus the hash)
  model: text("model"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
});

// HRMS — Vendor / Supplier register. The outside companies we buy from or
// rely on (suppliers, contractors, landlords, utilities, professionals).
// Contracts + renewals reuse the documents engine via documents.vendor_id.
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Supplier | Contractor | Service | Landlord | Utility | Professional | Other.
  category: text("category"),
  // Which of our portfolio companies this vendor primarily serves (optional).
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  // Free-text site/location, e.g. "Expat House A", "Head Office".
  location: text("location"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

// Links a renewal/action task back to the document it concerns. Mirrors
// meeting_tasks so a document can show its created tasks and vice-versa.
export const documentLinks = pgTable(
  "document_links",
  {
    documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.taskId] })]
);

// HRMS — Stock Control module. Mirrors the Excel stock workbook: an item
// register plus two movement ledgers (purchases IN, issues OUT). Current stock
// is never stored — it is DERIVED (opening + purchased − issued) at read time
// in src/lib/stock-shared.ts, the same way document/task status is derived.
export const stockItems = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  // Human code, e.g. "ST-001". Movements link to this, so it is unique.
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  unit: text("unit"),
  openingStock: integer("opening_stock").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(0),
  // Money — exact decimal (postgres NUMERIC). postgres.js returns this as a
  // STRING; do money maths in a decimal/minor-units form, never JS float.
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

// Stock IN. Each row raises the linked item's current stock automatically.
export const stockPurchases = pgTable("stock_purchases", {
  id: serial("id").primaryKey(),
  date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
  itemCode: text("item_code").notNull().references(() => stockItems.code, { onDelete: "cascade" }),
  qty: integer("qty").notNull(),
  // Money — exact decimal (postgres NUMERIC, returned as a STRING by postgres.js).
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  supplier: text("supplier"),
  ref: text("ref"), // invoice / PO number
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
}, (t) => [index("stock_purchases_item_idx").on(t.itemCode)]);

// Stock OUT. Each row lowers the linked item's current stock automatically.
// `companyId` tags the issue to one of the 7 portfolio companies (replaces the
// reference UI's free-text "entity"), so stock can be filtered per company.
export const stockIssues = pgTable("stock_issues", {
  id: serial("id").primaryKey(),
  date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
  itemCode: text("item_code").notNull().references(() => stockItems.code, { onDelete: "cascade" }),
  qty: integer("qty").notNull(),
  issuedTo: text("issued_to"),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
}, (t) => [index("stock_issues_item_idx").on(t.itemCode)]);

// HRMS — Asset Register. Durable, individually-tracked company assets (laptops,
// phones, vehicles, access cards) — distinct from consumable OECR stock. Each
// asset has a current holder (assignedToPersonId) and a status; the full
// assign/return history lives in asset_assignments. Offboarding returns a
// person's assets automatically.
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  // Optional asset tag, e.g. "LAP-001". Nullable; unique when present.
  tag: text("tag").unique(),
  name: text("name").notNull(),
  // Laptop | Phone | Vehicle | Access card | Furniture | Other (free-text — UI offers a list but allows new values).
  category: text("category"),
  // Manufacturer/brand and model, kept structured (name stays the human label).
  brand: text("brand"),
  model: text("model"),
  // Department the asset serves, e.g. "Operations", "HSE", "Finance".
  department: text("department"),
  serialNo: text("serial_no"),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  // The vendor this asset was bought from / is serviced by (optional).
  vendorId: integer("vendor_id").references((): AnyPgColumn => vendors.id, { onDelete: "set null" }),
  // Free-text site/location for shared or location-based assets, e.g. "Expat House A".
  location: text("location"),
  // in_store | assigned | maintenance | retired.
  status: text("status").notNull().default("in_store"),
  assignedToPersonId: integer("assigned_to_person_id").references(() => people.id, { onDelete: "set null" }),
  // For shared/team assets assigned to a company rather than one person.
  assignedToCompanyId: integer("assigned_to_company_id").references(() => companies.id, { onDelete: "set null" }),
  // The one person accountable for a shared asset (even if many use it).
  custodianPersonId: integer("custodian_person_id").references(() => people.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at", { mode: "date", withTimezone: true }),
  purchaseDate: timestamp("purchase_date", { mode: "date", withTimezone: true }),
  // Money — exact decimal (postgres NUMERIC, returned as a STRING by postgres.js).
  purchaseCost: numeric("purchase_cost", { precision: 14, scale: 2 }),
  notes: text("notes"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
}, (t) => [
  index("assets_company_idx").on(t.companyId),
  index("assets_assigned_person_idx").on(t.assignedToPersonId),
]);

// Assign/return ledger for assets. An open row (returnedAt IS NULL) = currently held.
export const assetAssignments = pgTable("asset_assignments", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at", { mode: "date", withTimezone: true }).notNull(),
  returnedAt: timestamp("returned_at", { mode: "date", withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
}, (t) => [
  index("asset_assignments_asset_idx").on(t.assetId),
  index("asset_assignments_person_idx").on(t.personId),
]);

// HRMS — Site tools & equipment. Quantity-tracked, site-owned durable tools
// (spanners, buckets, saws) — distinct from individually-serialised assets and
// from office-only OECR consumables. No single holder; each row is a tool kind
// at one site with a count and a condition.
export const siteTools = pgTable("site_tools", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  // Low-stock threshold for this tool at this site (0 = no alerting).
  minQty: integer("min_qty").notNull().default(0),
  // Free-text spec, e.g. "Size 30cm", "Plastic 20Lts", "Makita N550".
  specification: text("specification"),
  // Site/location, e.g. "Police Post", "NLM", "Matongo".
  location: text("location"),
  // good | needs_repair | retired.
  condition: text("condition").notNull().default("good"),
  purchasedDate: timestamp("purchased_date", { mode: "date", withTimezone: true }),
  remark: text("remark"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

// Movement ledger for site tools — every transfer between sites, condition
// change and write-off is recorded here so the register has an audit trail.
// type: created | transfer | condition | write_off | adjust.
export const siteToolMovements = pgTable("site_tool_movements", {
  id: serial("id").primaryKey(),
  toolId: integer("tool_id").references(() => siteTools.id, { onDelete: "set null" }),
  toolName: text("tool_name").notNull(), // snapshot — survives row deletion
  type: text("type").notNull(),
  quantity: integer("quantity"),
  fromLocation: text("from_location"),
  toLocation: text("to_location"),
  fromCondition: text("from_condition"),
  toCondition: text("to_condition"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

// HRMS — OCR (Office Cleaning Registry). Digital version of the paper daily
// cleaning checklist: one shared "Oracle Office" register. The areas are the
// "columns" of the sheet (editable); each day has one row; each area gets a
// tick + time + optional comment for that day. Completion % is DERIVED.

// The cleaning "columns" (Reception, Kitchen, …). Editable/orderable/retirable.
export const cleaningAreas = pgTable("cleaning_areas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
});

// One row per calendar date. `date` is stored at UTC midnight (all-day), unique.
// Attendance + sign-off reference People; signedAt locks the day.
export const cleaningDays = pgTable(
  "cleaning_days",
  {
    id: serial("id").primaryKey(),
    date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
    attendancePersonId: integer("attendance_person_id").references(() => people.id, { onDelete: "set null" }),
    note: text("note"),
    signedByPersonId: integer("signed_by_person_id").references(() => people.id, { onDelete: "set null" }),
    signedByName: text("signed_by_name"),
    signedAt: timestamp("signed_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("cleaning_days_date_idx").on(t.date)]
);

// One tick per (day, area): done + when + optional comment.
export const cleaningChecks = pgTable(
  "cleaning_checks",
  {
    id: serial("id").primaryKey(),
    dayId: integer("day_id").notNull().references(() => cleaningDays.id, { onDelete: "cascade" }),
    areaId: integer("area_id").notNull().references(() => cleaningAreas.id, { onDelete: "cascade" }),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { mode: "date", withTimezone: true }),
    comment: text("comment"),
  },
  (t) => [uniqueIndex("cleaning_checks_day_area_idx").on(t.dayId, t.areaId)]
);

// HRMS — Leave & Attendance.
// Leave types (Annual, Sick, …) with a default annual entitlement; balances
// are DERIVED (entitlement − approved days this year), never stored.
export const leaveTypes = pgTable("leave_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"),
  paid: boolean("paid").notNull().default(true),
  // Total entitlement in working days per cycle (0 = unlimited/uncapped, e.g. Unpaid).
  defaultDays: integer("default_days").notNull().default(0),
  // Length of the entitlement cycle in months (annual=12, sick=36 per ELR Act).
  cycleMonths: integer("cycle_months").notNull().default(12),
  // Portion of the entitlement paid at HALF wage (sick = 63 of 126); rest is full.
  halfPayDays: integer("half_pay_days").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
});

// Public holidays — excluded from leave-day counts and shown on attendance.
// companyId null = applies to all companies.
export const publicHolidays = pgTable("public_holidays", {
  id: serial("id").primaryKey(),
  date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
  name: text("name").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
}, (t) => [index("public_holidays_date_idx").on(t.date)]);

// Leave requests — the owner approves/rejects. `days` is working days (Mon–Sat
// minus holidays), supports half-days.
export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  leaveTypeId: integer("leave_type_id").notNull().references(() => leaveTypes.id, { onDelete: "restrict" }),
  startDate: timestamp("start_date", { mode: "date", withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { mode: "date", withTimezone: true }).notNull(),
  halfDay: boolean("half_day").notNull().default(false),
  days: doublePrecision("days").notNull().default(0),
  reason: text("reason"),
  // Pending | Approved | Rejected | Cancelled.
  status: text("status").notNull().default("Pending"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { mode: "date", withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
}, (t) => [
  index("leave_requests_person_idx").on(t.personId),
  index("leave_requests_status_idx").on(t.status),
]);

// Daily attendance register — one row per (person, date). Status:
// Present | Absent | On leave | Holiday | Remote | Half-day | Sick.
export const attendance = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
    status: text("status").notNull().default("Present"),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("attendance_person_date_idx").on(t.personId, t.date),
    index("attendance_date_idx").on(t.date),
  ]
);

// Recurring statutory / admin obligations — the cadence master list (from the
// owner's "Recurring Duties" workbook). These are NOT instances: each row is a
// repeating duty (PAYE monthly, provisional tax quarterly, etc.). When one
// enters its lead window the suggestion engine offers to materialise the next
// instance as a normal task (createdBy "recurring"); ticking that task done
// stamps last_done and rolls next_due forward. Reuse, don't duplicate.
export const recurringObligations = pgTable("recurring_obligations", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  // Null company = portfolio-wide / all entities.
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  // daily | weekly | monthly | quarterly | annual | event
  frequency: text("frequency").notNull(),
  // Human rule, e.g. "By 7th of next month", "By 20th", "Month-end", "Quarter-end".
  dueRule: text("due_rule"),
  // Day-of-month (1–31) for monthly numeric rules; null when rule is month-end etc.
  dueDay: integer("due_day"),
  // Task category to stamp on the materialised task (Finance/HR/Legal/Admin…).
  category: text("category").notNull().default("Admin"),
  // Why it matters — carried onto the task as context.
  why: text("why"),
  // How many days before next_due to start suggesting the task.
  leadDays: integer("lead_days").notNull().default(14),
  owner: text("owner"),
  notes: text("notes"),
  // Last time this duty was completed (stamped when its task is closed).
  lastDone: timestamp("last_done", { mode: "date", withTimezone: true }),
  // Cached next occurrence; recomputed on roll-forward.
  nextDue: timestamp("next_due", { mode: "date", withTimezone: true }),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

// Per-(obligation, company) state for recurring obligations. An obligation is a
// portfolio template; this table records, per company: whether it APPLIES (the
// opt-out — absent row means applicable by default) and the last time that
// company completed it (lastDone). "Done this period" is derived by comparing
// lastDone to the start of the current cadence period — so it resets and
// reappears each period with no unbounded per-period rows. The per-company tick
// grid replaces the single-company "promote to task" as the primary flow.
export const obligationCompany = pgTable(
  "obligation_company",
  {
    id: serial("id").primaryKey(),
    obligationId: integer("obligation_id").notNull().references(() => recurringObligations.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // false = operator marked it not applicable for this company (opt-out).
    applicable: boolean("applicable").notNull().default(true),
    // Last time this company completed this obligation (UTC). Null = never.
    lastDone: timestamp("last_done", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("obligation_company_idx").on(t.obligationId, t.companyId)]
);

// System-wide letters. A letter is generated from a template, edited freely as
// a Draft, then Issued — which freezes a letterhead snapshot + stamps ref/date.
export const letters = pgTable("letters", {
  id: serial("id").primaryKey(),
  // Template id, e.g. "invitation" | "blank".
  type: text("type").notNull(),
  title: text("title").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  // Stamped at Issue (PREFIX/INV/YYYY/NNN). UNIQUE so two issued letters can never
  // share a reference; NULLs (drafts) are not constrained. Allocate via number_series.
  ref: text("ref").unique(),
  letterDate: timestamp("letter_date", { mode: "date", withTimezone: true }),
  addressee: text("addressee"),
  subject: text("subject"),
  body: text("body").notNull().default(""),
  // Frozen letterhead (JSON) captured at Issue; null while Draft (renders live company).
  letterheadSnapshot: text("letterhead_snapshot"),
  // Draft | Issued.
  status: text("status").notNull().default("Draft"),
  issuedAt: timestamp("issued_at", { mode: "date", withTimezone: true }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

// Announcements — a one-to-many noticeboard. Authored by the owner (admin) or by
// portal directors/managers, delivered to a resolved live audience across the
// admin home + staff portal. Read/acknowledge state lives in announcement_receipts.
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  // policy | holiday | safety | celebration | operational | urgent
  type: text("type").notNull().default("operational"),
  // all | company | department | site | role | person_type | people | managers | directors
  audienceKind: text("audience_kind").notNull().default("all"),
  // number[] (company/department/site/people ids) or string[] (role/person_type)
  audienceValues: jsonb("audience_values").$type<(number | string)[]>().notNull().default([]),
  pinned: boolean("pinned").notNull().default(false),
  // When true, recipients must tick "read & understood" (tracked per person).
  requireAck: boolean("require_ack").notNull().default(false),
  // Extra delivery beyond the in-app banner: ["email","whatsapp"] → Outbox drafts.
  // Push notifications fire automatically and aren't listed here.
  deliverChannels: jsonb("deliver_channels").$type<string[]>().notNull().default([]),
  // Full-screen "must acknowledge before continuing" card on next portal landing.
  takeover: boolean("takeover").notNull().default(false),
  // draft | published | archived
  status: text("status").notNull().default("draft"),
  // Scheduled go-live (null = live as soon as published). Stored UTC.
  publishAt: timestamp("publish_at", { mode: "date", withTimezone: true }),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }),
  // "web-ui" (owner) | "portal-dir:<Name>" | "portal-mgr:<Name>"
  createdBy: text("created_by").notNull().default("web-ui"),
  authorPersonId: integer("author_person_id").references(() => people.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { mode: "date", withTimezone: true }),
});

// Per-person read / acknowledge state for an announcement. Rows are created
// lazily (on first view), mirroring chat's last_read_at pattern.
export const announcementReceipts = pgTable(
  "announcement_receipts",
  {
    announcementId: integer("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(), // "person:<id>" | "admin"
    seenAt: timestamp("seen_at", { mode: "date", withTimezone: true }),
    ackAt: timestamp("ack_at", { mode: "date", withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.recipient] }),
    index("announcement_receipts_recipient_idx").on(t.recipient),
  ]
);

// Emoji reactions on an announcement (one row per person+emoji; toggles).
export const announcementReactions = pgTable(
  "announcement_reactions",
  {
    announcementId: integer("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.announcementId, t.personId, t.emoji] })]
);

// Questions/replies under an announcement. personId null = owner (admin) reply.
export const announcementComments = pgTable("announcement_comments", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  // True when posted by the author/owner as an answer (rendered differently).
  isAnswer: boolean("is_answer").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
}, (t) => [index("announcement_comments_announcement_idx").on(t.announcementId)]);

/* ------------------------------------------------------------------ *
 * Request Desk (staff service requests). A member of staff (or a
 * manager/HR/director) raises a structured request addressed to ONE
 * named person (their manager, a director, HR) or to the owner. Unlike
 * chat it has a status the owner can track, and unlike a task it never
 * clutters the task register — when a request becomes real assignable
 * work it can be converted to a task (Phase 2, requests.converted_task_id).
 * The owner sees every request across all companies. See memory.
 * ------------------------------------------------------------------ */
export const requests = pgTable(
  "requests",
  {
    id: serial("id").primaryKey(),
    // Sequential reference, e.g. "REQ-001". Computed at insert.
    code: text("code").notNull().unique(),
    // Who raised it. Null when the owner raised it (fromOwner = true) — the
    // owner has no people row.
    requesterId: integer("requester_id").references(() => people.id, { onDelete: "cascade" }),
    fromOwner: boolean("from_owner").notNull().default(false),
    // LEGACY single-addressee columns (pre multi-recipient). Recipients now live
    // in request_recipients; these are kept only so the column drop isn't needed.
    addresseeId: integer("addressee_id").references(() => people.id, { onDelete: "set null" }),
    toOwner: boolean("to_owner").notNull().default(false),
    // The requester's company when raised — for the owner's company filter.
    companyId: integer("company_id").references(() => companies.id),
    // Free-text type with suggested chips (Equipment/HR/Admin/Finance/Feedback/…).
    category: text("category"),
    title: text("title").notNull(),
    body: text("body"),
    // open | needs_info | approved | declined | in_progress | done | noted | cancelled
    status: text("status").notNull().default("open"),
    // Decision audit (set when the addressee/owner approves, declines or notes).
    decisionReason: text("decision_reason"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { mode: "date", withTimezone: true }),
    // When the addressee/owner first opened it — powers the "Seen" indicator.
    seenAt: timestamp("seen_at", { mode: "date", withTimezone: true }),
    // Phase-2 bridge: the task this request became, if converted.
    convertedTaskId: integer("converted_task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [
    index("requests_requester_idx").on(t.requesterId),
    index("requests_addressee_idx").on(t.addresseeId),
    index("requests_status_idx").on(t.status),
    index("requests_company_idx").on(t.companyId),
  ]
);

// The on-record conversation for a request. kind null = a message; kind
// "event" = a status/decision marker rendered as a thin centred line.
export const requestUpdates = pgTable(
  "request_updates",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    // "portal:<Name>" / "portal-mgr:<Name>" / "portal-dir:<Name>" / "web-ui" (owner).
    createdBy: text("created_by"),
    kind: text("kind"),
    // A photo/file attached to this message, stored as a Document (category
    // "Attachment"), served via /api/portal/request-attachment with auth.
    attachmentDocumentId: integer("attachment_document_id").references(() => documents.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
  },
  (t) => [index("request_updates_request_idx").on(t.requestId)]
);

// A request can be addressed to one OR several people (and/or the owner). Any
// recipient can act on it ("shared / any-of"). person_id null + is_owner true
// means the owner is a recipient.
export const requestRecipients = pgTable(
  "request_recipients",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
    personId: integer("person_id").references(() => people.id, { onDelete: "cascade" }),
    isOwner: boolean("is_owner").notNull().default(false),
    // "addressee" (can act) — reserved for a future "cc" role.
    role: text("role").notNull().default("addressee"),
  },
  (t) => [
    index("request_recipients_request_idx").on(t.requestId),
    index("request_recipients_person_idx").on(t.personId),
  ]
);

// Atomic reference/number allocation. Replaces the old COUNT(*)+1 / max-scan
// numbering (which duplicated or gapped refs and races under concurrency). One
// row per series, e.g. "letter:DS:INV:2026", "invoice:DS:2026", "request". The
// next number is reserved by bumping next_val IN A TRANSACTION:
//
//   UPDATE number_series SET next_val = next_val + 1
//   WHERE series_key = $1 RETURNING next_val;   -- (insert the row first if absent)
//
// The RETURNING value is the reserved number; the UPDATE's row lock serialises
// concurrent allocations so two callers never get the same number. Pair with the
// UNIQUE constraint on the consuming column (e.g. letters.ref) as a backstop.
export const numberSeries = pgTable("number_series", {
  seriesKey: text("series_key").primaryKey(),
  nextVal: integer("next_val").notNull().default(0),
});

// AI job queue — the bridge between the live app and the Claude Code cloud agent
// ("cloud-agent-as-engine", memory/cloud_agent_plan.md). The app enqueues a job;
// a cloud routine (running on the owner's Max plan, PC-independent) claims it via
// claim_next_ai_job(), does the work, and writes back `result`. No API key.
//   kind:   ping | extract | ask | action (+ future)
//   status: queued | running | done | error
//   lane:   fast (interactive, ~real-time) | batch (heavy/scheduled)
//   tier:   autonomy tier (1 auto · 2 auto-if-safe · 3 confirm send/spend/delete)
export const aiJobs = pgTable("ai_jobs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("queued"),
  lane: text("lane").notNull().default("batch"),
  priority: integer("priority").notNull().default(0),
  payload: jsonb("payload").notNull().default({}),
  result: jsonb("result"),
  error: text("error"),
  requestedBy: text("requested_by"),
  threadId: integer("thread_id"),
  tier: integer("tier").notNull().default(1),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  pickedAt: timestamp("picked_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  undoToken: text("undo_token"),
}, (t) => [
  index("ai_jobs_queue_idx").on(t.status, t.lane, t.priority, t.createdAt),
  index("ai_jobs_thread_idx").on(t.threadId),
]);
