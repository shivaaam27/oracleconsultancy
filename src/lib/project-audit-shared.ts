// ─────────────────────────────────────────────────────────────────────────────
// PROJECT AUDIT — the client-safe half (labels + plain-language wording).
//
// ⚠️ No `sb` import here. The server half is `project-audit.ts`; a client
// component that imports the server one takes every page down with
// "SUPABASE_SERVICE_ROLE_KEY is not set" (CLAUDE.md, the hard rule).
// ─────────────────────────────────────────────────────────────────────────────

export type AuditRow = {
  id: number;
  entity: string;
  entityId: number | null;
  label: string | null;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdBy: string;
  createdAt: string;
};

/** Which sheet a change happened on, in the owner's words. */
export const ENTITY_LABELS: Record<string, string> = {
  project: "Project",
  budget_line: "Budget",
  requisition: "Requisition",
  payment: "Payment",
  expenditure: "Spending",
  payment_stage: "Payment plan",
  site_person: "Site person",
  site_day: "Site day",
  ref: "List",
};

/** The tabs a filter rail offers, in tab order. */
export const AUDIT_ENTITIES = [
  "project", "budget_line", "requisition", "payment",
  "expenditure", "payment_stage", "site_person", "site_day", "ref",
] as const;

const FIELD_LABELS: Record<string, string> = {
  name: "Name", variant: "Variant", client: "Client", location: "Location",
  po_number: "PO number", start_date: "Start date", duration_days: "Duration (days)",
  quotation_value: "Quotation", po_value: "PO value", additional_work: "Additional work",
  vat_rate: "VAT rate", wht_rate: "WHT rate", completion_pct: "Completion",
  status: "Status", notes: "Notes", archived: "Archived", currency: "Currency",
  meal_rate: "Meal rate",
  item_code: "Item code", category: "Category", sub_job: "Sub-job",
  materials_amount: "Materials", labour_amount: "Labour",
  total_payable: "Invoice total",
  ipc_submitted: "IPC submitted", ipc_processed: "IPC processed", efd_issued: "EFD receipt",
  description: "Description", amount: "Amount", qty: "Quantity", unit: "Unit",
  batch_no: "Batch no.", requested_date: "Requested on", qty_requested: "Quantity requested",
  rate: "Rate", amount_requested: "Amount requested", route: "Who pays",
  supplier: "Supplier", reference_no: "Reference no.", remarks: "Remarks",
  amount_approved: "Amount approved", approved_by: "Approved by",
  received_date: "Received on", grn_no: "GRN no.", qty_received: "Quantity received",
  amount_received: "Amount received", received_by: "Received by",
  paid_date: "Paid on", amount_paid: "Amount paid",
  spent_date: "Spent on", payer: "Whose float", source: "Money from", mobile_no: "Mobile no.",
  label: "Stage", threshold_pct: "At completion", share_pct: "Share",
  invoice_date: "Invoiced on", invoice_amount: "Invoiced", 
  designation: "Job", kind: "Type", daily_rate: "Daily rate", phone: "Phone",
  meals_eligible: "Gets meals", active: "Active",
  meal: "Meal", day: "Day",
};

/**
 * ⚠️ `labour_amount` means two different things in two different tables — the
 * labour half of a budget line, and a day's wage on the site sheet — so it
 * cannot live in the map above (one object, one key). The entity decides.
 */
const PER_ENTITY: Record<string, Record<string, string>> = {
  site_day: { labour_amount: "Wage" },
};

export function fieldLabel(field: string | null, entity?: string): string {
  if (!field) return "";
  const perEntity = entity ? PER_ENTITY[entity]?.[field] : undefined;
  return perEntity ?? FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

/** Money-ish fields are shown with thousands separators; the rest as typed. */
const MONEY = /(amount|value|rate|paid|received)$/;
export function isMoneyField(field: string | null): boolean {
  if (!field) return false;
  if (field === "vat_rate" || field === "wht_rate" || field === "share_pct") return false;
  return MONEY.test(field);
}

/** "1500000" → "1,500,000". Anything non-numeric is passed straight through. */
export function displayValue(field: string | null, v: string | null): string {
  if (v === null || v === "") return "—";
  if (v === "true") return "Yes";
  if (v === "false") return "No";
  if (isMoneyField(field)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  }
  return v;
}

/** Who did it — the same discriminators the rest of COS uses. */
export function actorLabel(createdBy: string): string {
  const by = (createdBy ?? "").trim();
  if (/^portal:/i.test(by)) return by.split(":").slice(1).join(":").trim() || "Staff";
  if (/^ai-/i.test(by) || by === "mcp") return "Assistant";
  if (by === "" || /^(cron|system|automation)/i.test(by)) return "System";
  return "You";
}

const ACTION_WORDS: Record<string, string> = {
  created: "Added", updated: "Changed", deleted: "Deleted",
  approved: "Approved", received: "Received",
  rejected: "Rejected", cancelled: "Cancelled",
  archived: "Archived", restored: "Restored",
};

/**
 * A created row is stored as "item_code=CEMENT, amount=500" — compact in the
 * database, unreadable on screen. This turns it back into English:
 * "Item code CEMENT - Amount 500".
 */
export function summarise(newValue: string | null): string {
  if (!newValue) return "";
  return newValue
    .split(", ")
    .map((pair) => {
      const at = pair.indexOf("=");
      if (at < 0) return pair;
      const key = pair.slice(0, at);
      const v = pair.slice(at + 1);
      return fieldLabel(key) + " " + displayValue(key, v);
    })
    .join(" · ");
}

/** One line of plain English for a change. */
export function describeAudit(r: AuditRow): string {
  const what = ENTITY_LABELS[r.entity] ?? r.entity;
  const who = r.label ? ` ${r.label}` : "";
  const word = ACTION_WORDS[r.action] ?? r.action;
  if (r.action === "updated" && r.field) {
    return `${what}${who} — ${fieldLabel(r.field, r.entity)} changed`;
  }
  return `${word} ${what.toLowerCase()}${who}`;
}
