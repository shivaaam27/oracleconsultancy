import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  accentColor: text("accent_color"),
  // Two-letter prefix for task codes, e.g. "DS" → DS-001 (see migrate-task-codes).
  codePrefix: text("code_prefix"),
});

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

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
  managerId: integer("manager_id"),
  // Employment start date (org/master data). Stored at UTC midnight (all-day).
  startDate: timestamp("start_date", { mode: "date", withTimezone: true }),
  contactStatus: text("contact_status"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  snoozedUntil: timestamp("snoozed_until", { mode: "date", withTimezone: true }),
  // Canonical HR types (see lib/person-types.ts): "local_staff" | "expat" |
  // "outsider" | "candidate". Legacy internal→local_staff, external→outsider.
  personType: text("person_type").notNull().default("local_staff"),
  // Soft self-reference: e.g. an immigration agent → the expat they are helping, or vice-versa.
  relatedPersonId: integer("related_person_id"),
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
  (t) => [primaryKey({ columns: [t.personId, t.companyId] })]
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
    requestedAt: timestamp("requested_at", { mode: "date", withTimezone: true }),
    receivedAt: timestamp("received_at", { mode: "date", withTimezone: true }),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    verifiedBy: text("verified_by"),
    waivedReason: text("waived_reason"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("person_requirements_person_item_idx").on(t.personId, t.itemId)]
);

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
});

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.personId] })]
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
});

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
});

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
  dueAt: timestamp("due_at", { mode: "date", withTimezone: true }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
});

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
  archived: boolean("archived").notNull().default(false),
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
  unitCost: doublePrecision("unit_cost").notNull().default(0),
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
  unitCost: doublePrecision("unit_cost").notNull().default(0),
  supplier: text("supplier"),
  ref: text("ref"), // invoice / PO number
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

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
