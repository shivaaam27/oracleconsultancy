/**
 * Seed the recurring-obligations master list from the owner's "Recurring Duties"
 * workbook sheet. Idempotent — keyed by label, safe to re-run.
 * Usage: npx tsx scripts/seed-recurring-obligations.ts
 *
 * companyId is left null (portfolio-wide / all entities) — the operator can
 * scope individual rows to a company later. leadDays defaults per cadence.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

type Row = {
  label: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "event";
  dueRule?: string;
  dueDay?: number;
  category: string;
  why?: string;
};

const LEAD: Record<Row["frequency"], number> = {
  daily: 1, weekly: 3, monthly: 7, quarterly: 21, annual: 45, event: 14,
};

// Faithful to the sheet order (drives sort_order).
const ROWS: Row[] = [
  // DAILY
  { label: "Check Today/This Week list & deadlines", frequency: "daily", dueRule: "Each morning", category: "Admin", why: "Stops anything slipping" },
  { label: "Capture new tasks into the tracker", frequency: "daily", dueRule: "As they arrive", category: "Admin", why: "Keeps it out of your head" },
  { label: "Action / triage the Director's requests", frequency: "daily", dueRule: "Same day where possible", category: "Admin", why: "Managing up" },
  // WEEKLY
  { label: "Run down recurring duties & tick off", frequency: "weekly", dueRule: "Pick a day (e.g. Fri)", category: "Admin", why: "Nothing repeating is missed" },
  { label: "Chase 'Waiting On Others' items", frequency: "weekly", dueRule: "Friday", category: "Admin", why: "Keeps others accountable" },
  { label: "Facility / cleaning standards check", frequency: "weekly", dueRule: "Set day", category: "Operations", why: "Office runs smoothly" },
  { label: "Prep Director update (1 line per company)", frequency: "weekly", dueRule: "Before review", category: "Strategy", why: "Proactive reporting" },
  { label: "Review permit expiries 8+ weeks out", frequency: "weekly", dueRule: "Friday", category: "Legal", why: "High-risk early warning" },
  // MONTHLY
  { label: "PAYE, SDL & WHT paid + filed", frequency: "monthly", dueRule: "By 7th of next month", dueDay: 7, category: "Finance", why: "Statutory — penalties if late" },
  { label: "NSSF & WCF contributions", frequency: "monthly", dueRule: "By month-end", category: "Finance", why: "Statutory" },
  { label: "VAT return + payment (if registered)", frequency: "monthly", dueRule: "By 20th of next month", dueDay: 20, category: "Finance", why: "Statutory — heavily audited" },
  { label: "Enter KPI actuals into the History Log", frequency: "monthly", dueRule: "Month-end", category: "Strategy", why: "Performance tracking" },
  { label: "Reconcile inter-company balances", frequency: "monthly", dueRule: "Month-end", category: "Finance", why: "Transfer-pricing hygiene" },
  { label: "Update asset register / stock checks", frequency: "monthly", dueRule: "Month-end", category: "Admin", why: "Admin accuracy" },
  { label: "Staff records review (complete & current)", frequency: "monthly", dueRule: "Month-end", category: "HR", why: "HR compliance" },
  { label: "Vendor invoices processed", frequency: "monthly", dueRule: "Ongoing/month-end", category: "Finance", why: "Supplier relations" },
  // QUARTERLY
  { label: "Provisional income tax instalment", frequency: "quarterly", dueRule: "31 Mar / 30 Jun / 30 Sep / 31 Dec", category: "Finance", why: "Statutory pre-payment" },
  { label: "Review & tidy KPI targets", frequency: "quarterly", dueRule: "Quarter-end", category: "Strategy", why: "Keep KPIs useful" },
  { label: "Review DoA thresholds with Director", frequency: "quarterly", dueRule: "Quarter-end", category: "Legal", why: "Governance stays current" },
  // ANNUAL
  { label: "Provisional (estimate) tax return", frequency: "annual", dueRule: "Start of year of income", category: "Finance", why: "Statutory" },
  { label: "Final income tax return + audited accounts", frequency: "annual", dueRule: "Within 6 months of year-end", category: "Finance", why: "Statutory — by 30 Jun (Dec year-end)" },
  { label: "File audited accounts with BRELA", frequency: "annual", dueRule: "Per BRELA", category: "Legal", why: "Statutory" },
  { label: "Business licence renewals", frequency: "annual", dueRule: "Per licence", category: "Legal", why: "Keeps companies trading legally" },
  { label: "Transfer-pricing documentation refresh", frequency: "annual", dueRule: "By tax-return due date", category: "Finance", why: "TRA can demand within 30 days" },
  { label: "WCF annual return", frequency: "annual", dueRule: "By 31 Mar", category: "Finance", why: "Statutory" },
  // EVENT-DRIVEN
  { label: "New hire: contract, TIN, NSSF/WCF reg, onboarding", frequency: "event", dueRule: "Before first payroll", category: "HR", why: "Legal + smooth start" },
  { label: "Leaver: final pay, records closed, access removed", frequency: "event", dueRule: "Promptly", category: "HR", why: "Clean exit, no liability" },
  { label: "Director/shareholder/address change → file BRELA", frequency: "event", dueRule: "Promptly", category: "Legal", why: "Statutory record accuracy" },
  { label: "Share transfer: tax clearance before BRELA", frequency: "event", dueRule: "Per deal", category: "Legal", why: "Required to register" },
  { label: "New inter-company arrangement → signed agreement", frequency: "event", dueRule: "At the time", category: "Legal", why: "Transfer-pricing compliance" },
  { label: "WHT on a qualifying payment → withhold & remit", frequency: "event", dueRule: "By 7th next month", dueDay: 7, category: "Finance", why: "Statutory" },
  { label: "Permit nearing expiry → start renewal", frequency: "event", dueRule: "60+ days out", category: "Legal", why: "Avoid lapse" },
  { label: "TRA document request → respond", frequency: "event", dueRule: "Within 30 days", category: "Legal", why: "No extensions allowed" },
];

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, max: 1 });
  const now = new Date().toISOString();
  const existing = await sql`SELECT label FROM recurring_obligations`;
  const have = new Set(existing.map((r) => (r as { label: string }).label));
  let created = 0;
  for (let i = 0; i < ROWS.length; i++) {
    const r = ROWS[i];
    if (have.has(r.label)) continue;
    await sql`INSERT INTO recurring_obligations
      (label, company_id, frequency, due_rule, due_day, category, why, lead_days, sort_order, active, created_at, updated_at, created_by)
      VALUES (${r.label}, ${null}, ${r.frequency}, ${r.dueRule ?? null}, ${r.dueDay ?? null}, ${r.category},
              ${r.why ?? null}, ${LEAD[r.frequency]}, ${i}, true, ${now}, ${now}, 'web-ui')`;
    created++;
  }
  console.log(`Seeded ${created} recurring obligation(s); ${have.size} already present.`);
  await sql.end();
})();
