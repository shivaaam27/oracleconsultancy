import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  accentColor: text("accent_color"),
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
  managerId: integer("manager_id"),
  contactStatus: text("contact_status"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  snoozedUntil: timestamp("snoozed_until", { mode: "date" }),
  // "internal" (employed) | "external" (broker, agent, vendor) | "expat" (person being processed).
  personType: text("person_type").notNull().default("internal"),
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

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  departmentId: integer("department_id").references(() => departments.id),
  meetingDate: timestamp("meeting_date", { mode: "date" }),
  actionItem: text("action_item").notNull(),
  ownerId: integer("owner_id").references(() => people.id),
  createdDate: timestamp("created_date", { mode: "date" }),
  deadline: timestamp("deadline", { mode: "date" }),
  status: text("status").notNull().default("Not Started"),
  priority: text("priority").notNull().default("Low"),
  category: text("category"),
  risk: text("risk"),
  escalation: text("escalation").default("No"),
  comments: text("comments"),
  latestUpdate: text("latest_update"),
  lastUpdatedAt: timestamp("last_updated_at", { mode: "date" }),
  closedDate: timestamp("closed_date", { mode: "date" }),
  archived: boolean("archived").notNull().default(false),
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
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  createdBy: text("created_by"),
  /** Set on first edit; preserves the original text for history. */
  originalBody: text("original_body"),
  /** Timestamp of most recent edit (null = never edited). */
  editedAt: timestamp("edited_at", { mode: "date" }),
  /** Soft-delete marker; rows with this set are hidden from timelines. */
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  /** When set, sort this update to the top of its task's timeline. */
  pinnedAt: timestamp("pinned_at", { mode: "date" }),
});

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
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  createdBy: text("created_by"),
  /** Soft-delete marker. Hidden from timelines + /audit by default; toggleable. */
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const corrections = pgTable("corrections", {
  id: serial("id").primaryKey(),
  auditLogId: integer("audit_log_id").references(() => auditLog.id),
  correctedByEntryId: integer("corrected_by_entry_id").references(() => auditLog.id),
  status: text("status").notNull().default("Open"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
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
    sentAt: timestamp("sent_at", { mode: "date" }),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
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
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  sentAt: timestamp("sent_at", { mode: "date" }),
});

export const dailySnapshots = pgTable(
  "daily_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotDate: timestamp("snapshot_date", { mode: "date" }).notNull(),
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
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
});

export const undoTokens = pgTable("undo_tokens", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  taskId: integer("task_id"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { mode: "date" }),
});
