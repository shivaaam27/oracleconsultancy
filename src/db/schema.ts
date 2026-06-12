import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, primaryKey, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  accentColor: text("accent_color"),
  // Two-letter prefix for task codes, e.g. "DS" → DS-001 (see migrate-task-codes).
  codePrefix: text("code_prefix"),
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
});

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
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
  managerId: integer("manager_id"),
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
  relatedPersonId: integer("related_person_id"),
  // Staff portal sign-in (scrypt hash, set by the owner from Settings).
  // Null hash = no portal access. See src/lib/portal-auth.ts.
  portalPasswordHash: text("portal_password_hash"),
  portalEnabledAt: timestamp("portal_enabled_at", { mode: "date", withTimezone: true }),
  portalLastLoginAt: timestamp("portal_last_login_at", { mode: "date", withTimezone: true }),
  // "staff" (own tasks only) or "manager" (own + direct reports' tasks,
  // may complete tasks and pin instructions). Only meaningful with access.
  portalRole: text("portal_role").notNull().default("staff"),
  // Comma-separated former staff IDs, stamped when the person moves company,
  // so old references (e.g. CZ-E04) stay traceable. See lib/staff-id.ts.
  previousStaffIds: text("previous_staff_ids"),
  // Explicit staff-ID category override: "director"|"manager"|"admin_hr"|
  // "employee". Null = derive the letter from the role text. See lib/staff-id.ts.
  staffCategory: text("staff_category"),
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
  (t) => [primaryKey({ columns: [t.personId, t.managerId] })]
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
    requestedAt: timestamp("requested_at", { mode: "date", withTimezone: true }),
    receivedAt: timestamp("received_at", { mode: "date", withTimezone: true }),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    verifiedBy: text("verified_by"),
    waivedReason: text("waived_reason"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("company_requirements_company_source_idx").on(t.companyId, t.sourceKey)]
);

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
});

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    // "accountable" (answers for the task) or "working" (doing the task).
    // tasks.owner_id remains the FIRST accountable person for back-compat;
    // additional accountable people are assignees with this role.
    role: text("role").notNull().default("working"),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.personId] })]
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
  kind: text("kind").notNull(), // mention | reply | pinned | assigned | chat | chat_mention
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  taskCode: text("task_code"),
  // Chat deep-link target (kind chat / chat_mention). Null for task notifs.
  threadId: integer("thread_id"),
  title: text("title").notNull(),
  body: text("body"),
  actor: text("actor"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  readAt: timestamp("read_at", { mode: "date", withTimezone: true }),
});

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
  parentUpdateId: integer("parent_update_id"),
  /** Optional file attached to this message — stored as a real `documents`
   *  row (so it appears in the Documents centre and is linked to the task). */
  attachmentDocumentId: integer("attachment_document_id"),
});

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
  },
  (t) => [primaryKey({ columns: [t.threadId, t.participant] })]
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
});

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
  // Tags a to-do as part of a person journey: "onboarding" | "offboarding".
  // NULL for ordinary personal to-dos. Lets the drawer group/progress steps
  // and prevents duplicate generation, while steps still live in the to-do system.
  kind: text("kind"),
  // Ordering within a generated journey checklist (0-based); NULL for ad-hoc to-dos.
  sortOrder: integer("sort_order"),
  dueAt: timestamp("due_at", { mode: "date", withTimezone: true }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
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
  reminderMinutes: integer("reminder_minutes"),
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
  createdBy: text("created_by").notNull().default("web-ui"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
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
  // Optional link to the vendor this document belongs to (e.g. a supplier
  // contract or a service agreement). Lets vendor contracts reuse the
  // documents expiry/compliance engine.
  vendorId: integer("vendor_id").references((): AnyPgColumn => vendors.id, { onDelete: "set null" }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
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
  purchaseCost: doublePrecision("purchase_cost"),
  notes: text("notes"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull().default("web-ui"),
});

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
});

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
});

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
});

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
  (t) => [uniqueIndex("attendance_person_date_idx").on(t.personId, t.date)]
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
  ref: text("ref"),
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
