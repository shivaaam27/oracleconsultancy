import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
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
});

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

export const dailySnapshots = pgTable("daily_snapshots", {
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
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});
