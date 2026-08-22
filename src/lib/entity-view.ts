// ─────────────────────────────────────────────────────────────────────────────
// Entity VIEW metadata — Stage 3 of the ERPNext redesign.
//
// This is the point of the whole programme. ERPNext's uniformity is not design
// discipline, it is METADATA: every DocType is a definition, and one list view
// and one form view are generated for all of them. This file is that definition
// layer for COS — it says what a record's LIST COLUMNS and FORM SECTIONS are,
// and the two shells (RecordList / RecordPage) are generated from it.
//
// ⚠️ CLIENT-SAFE, and it must stay that way. `entity-registry.ts` imports the
// server-only Supabase client, so a client component can never import it (that
// crashed the whole app once — see the header of entity-meta.ts). Everything
// here is plain data with type-only imports, so both sides can read it.
//
// ⚠️ DECLARATIVE ONLY — no functions. A column says `format: "date"`, and the
// client maps that name to a renderer (`entity-cells.tsx`). A render function
// could not live in metadata: it cannot cross the server/client boundary, and
// it could not be stored in a database later.
//
// TO GIVE A NEW ENTITY A SCREEN: add one entry to ENTITY_VIEWS. It gets the
// column list, the sorting, the field grid and the density for free.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityType } from "@/lib/entity-meta";

/** How a value is drawn. The client holds one renderer per name. */
export type CellFormat =
  | "text"      // plain string, truncated
  | "code"      // mono chip (task code, reference number)
  | "date"      // short date, quiet when absent
  | "status"    // status word + its dot
  | "priority"  // severity dot + word
  | "people"    // one or more names
  | "company"   // company name with its accent dot
  | "number"    // tabular figures
  | "muted";    // secondary text

export type ListColumnDef = {
  /** Field on the row object. */
  key: string;
  label: string;
  /** CSS grid track — "minmax(0,1fr)" for the flexible one, "116px" for fixed. */
  width: string;
  format?: CellFormat;
  align?: "left" | "right";
  /** Drop the column on smaller screens so a dense list still works on a phone. */
  hideBelow?: "sm" | "md" | "lg";
  /** Sortable columns get a header link; the page supplies the URL. */
  sortable?: boolean;
  /**
   * Off by default, but still offered in the Columns chooser.
   *
   * ⚠️ For a column that is worth HAVING but not worth the width. Six columns
   * do not fit the 547px card the content area has at 1024px once the desk
   * sidebar takes its 208px, and the column that loses is always the flexible
   * one — the record's own name. This is how a list stays narrow without
   * pretending the column does not exist.
   */
  defaultHidden?: boolean;
};

export type FormFieldDef = {
  key: string;
  label: string;
  format?: CellFormat;
  /** Span both columns — descriptions, notes, anything long. */
  full?: boolean;
};

export type FormSectionDef = {
  id: string;
  title: string;
  fields: FormFieldDef[];
  collapsible?: boolean;
  defaultOpen?: boolean;
};

/** Which rails a list offers. Counts and URLs are computed by the page (it is
 *  the only thing that knows the current filters); this says what exists. */
export type FilterGroupDef = {
  /** Group heading in the rail. */
  label: string;
  /** Where the options come from: a fixed field, or a lookup table. */
  source: "status" | "flag" | "company" | "person" | "category";
};

/**
 * How this record type is raised — what the global New menu offers.
 *
 * `href` is all the metadata needs to carry: either a real create route
 * (`/task/new`) or a list URL the owning page understands (`/documents?newdoc=1`).
 * Most creates in COS are dialogs owned by a page, so the second form is the
 * common one — the owning component reads the param with `useCreateParam` and
 * opens its own dialog. No icons here: an icon is a component, and this file is
 * plain data. The menu maps type → icon, exactly as entity-cells maps
 * format → renderer.
 */
export type CreateDef = {
  /** Menu wording. Says what you get, not what you click: "Task", not "New task". */
  label: string;
  href: string;
};

export type EntityView = {
  listColumns: ListColumnDef[];
  filters?: FilterGroupDef[];
  formSections?: FormSectionDef[];
  defaultSort?: { key: string; dir: "asc" | "desc" };
  /** Offered in the global New menu. Omit for a type you cannot raise by hand. */
  create?: CreateDef;
};

/**
 * One entry per entity that has a screen. Adding an entity here is what earns
 * it an ERPNext-shaped list and record — no new components.
 */
/*
 * ⚠️ A PHONE ROW IS ABOUT 311px OF GRID (375px screen, less the page and card
 * padding). Fixed column widths are desktop widths and they do not shrink, so a
 * list of name + three fixed columns leaves the `minmax(0,1fr)` NAME column
 * nothing at all — measured at 28px on the task list, which rendered as status
 * and date with no task on it. Every list therefore folds its middle column(s)
 * away below `sm`, keeping the name and the ONE figure the list is sorted by.
 *
 * `hideBelow` now frees the column’s grid TRACK as well as hiding the cell
 * (gridFor in record-list.tsx) — it used to hide the cell and leave the track,
 * which is what let a hidden 80px “Who” column carry on squeezing the name.
 *
 * FORWARD RULE: a new list adds up its fixed widths. Past ~200px, mark the
 * columns that are not the name and not the key figure `hideBelow: "sm"`.
 */
export const ENTITY_VIEWS: Partial<Record<EntityType, EntityView>> = {
  task: {
    listColumns: [
      { key: "actionItem", label: "Task", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "status", label: "Status", width: "150px", format: "status", hideBelow: "sm", sortable: true },
      { key: "deadline", label: "Deadline", width: "116px", format: "date", sortable: true },
      { key: "assignees", label: "Who", width: "80px", format: "people", align: "right", hideBelow: "md", sortable: true },
    ],
    filters: [
      { label: "Status", source: "status" },
      { label: "Company", source: "company" },
    ],
    formSections: [
      {
        id: "detail",
        title: "Detail",
        fields: [
          { key: "deadline", label: "Deadline", format: "date" },
          { key: "category", label: "Category", format: "text" },
          { key: "department", label: "Department", format: "text" },
          { key: "companyName", label: "Company", format: "company" },
          { key: "comments", label: "About", format: "text", full: true },
        ],
      },
    ],
    defaultSort: { key: "deadline", dir: "asc" },
    create: { label: "Task", href: "/task/new" },
  },

  person: {
    // Matches what the People screen actually does: identify someone, see who
    // they report to, what portal access they have, and how much is on them.
    listColumns: [
      { key: "name", label: "Name", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "managerId", label: "Manager", width: "150px", format: "text", hideBelow: "md" },
      { key: "portalRole", label: "Portal", width: "86px", format: "text", hideBelow: "sm" },
      { key: "workload", label: "Open", width: "62px", format: "number", align: "right" },
    ],
    filters: [{ label: "Company", source: "company" }],
    formSections: [
      {
        id: "detail",
        title: "Detail",
        fields: [
          { key: "role", label: "Role", format: "text" },
          { key: "department", label: "Department", format: "text" },
          { key: "companyName", label: "Company", format: "company" },
          { key: "startDate", label: "Started", format: "date" },
        ],
      },
    ],
    defaultSort: { key: "name", dir: "asc" },
    create: { label: "Person", href: "/people?new=1" },
  },

  company: {
    listColumns: [
      { key: "name", label: "Company", width: "minmax(0,1fr)", format: "company", sortable: true },
      { key: "openTasks", label: "Open", width: "80px", format: "number", align: "right", hideBelow: "sm", sortable: true },
      { key: "overdue", label: "Overdue", width: "90px", format: "number", align: "right", sortable: true },
      { key: "people", label: "People", width: "80px", format: "number", align: "right", hideBelow: "md", sortable: true },
    ],
    defaultSort: { key: "name", dir: "asc" },
    create: { label: "Company", href: "/companies?new=1" },
  },

  document: {
    listColumns: [
      { key: "title", label: "Document", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "category", label: "Category", width: "140px", format: "muted", hideBelow: "md", sortable: true },
      // Folded away below `sm` and re-shown INSIDE the title cell there (see the
      // `title` override in documents-table.tsx). A fixed 130px column against a
      // `minmax(0,1fr)` title left the name ~150px on a phone, which is not enough
      // to tell "PES_Business-Lic…" from "PES_Business-Lic…" — five rows read alike.
      { key: "expiryDate", label: "Expires", width: "130px", format: "date", align: "right", hideBelow: "sm", sortable: true },
      { key: "status", label: "Status", width: "104px", format: "status", hideBelow: "sm" },
    ],
    filters: [
      { label: "Category", source: "category" },
      { label: "Company", source: "company" },
    ],
    defaultSort: { key: "expiryDate", dir: "asc" },
    // `newdoc=1` already existed for the old Inbox hand-off — reuse it rather
    // than teach the page a second way to mean the same thing.
    create: { label: "Document", href: "/documents?newdoc=1" },
  },

  vendor: {
    listColumns: [
      { key: "name", label: "Vendor", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "category", label: "Category", width: "150px", format: "muted", hideBelow: "md", sortable: true },
      { key: "companyName", label: "Company", width: "160px", format: "company", hideBelow: "lg", sortable: true },
      { key: "contact", label: "Contact", width: "170px", format: "muted", hideBelow: "md" },
    ],
    defaultSort: { key: "name", dir: "asc" },
    // Assets and Vendors share one page and BOTH tables are mounted, so a bare
    // `new=1` would open two dialogs at once. Name the one you mean.
    create: { label: "Vendor", href: "/hrms/assets?view=vendors&new=vendor" },
  },

  /* CocoZuri Operations — Phase 1. See memory/cocozuri_ops_plan.md.
     Two columns carry the work: what it is, and what it costs. Everything else
     hides on a narrow screen. */
  /* ⚠️ THESE WIDTHS ADD UP TO FIT A 547px CARD — the width the content area has
     at 1024px once the desk sidebar takes its 208px. They used to total 480px
     against a `minmax(0,1fr)` name, which resolved the PRODUCT column to ZERO:
     127 chocolates listed with no chocolate names on them. `hideBelow` cannot
     fix that (it folds columns away on SMALL screens, and this breaks on the
     first LARGE one), so the answer is a smaller budget. Brand is the column
     that went: the whole catalogue holds two of them, COCOZURI and COCOFIX, so
     it tells you least — and Columns puts it back. */
  cz_product: {
    listColumns: [
      { key: "name", label: "Product", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "category", label: "Category", width: "130px", format: "muted", hideBelow: "md", sortable: true },
      { key: "brand", label: "Brand", width: "90px", format: "muted", hideBelow: "lg", sortable: true, defaultHidden: true },
      { key: "packLabel", label: "Pack", width: "80px", format: "muted", hideBelow: "md" },
      { key: "listPrice", label: "List price", width: "100px", format: "muted", align: "right", sortable: true },
    ],
    defaultSort: { key: "name", dir: "asc" },
    create: { label: "Product", href: "/cocozuri/products?new=1" },
  },

  cz_customer: {
    listColumns: [
      { key: "name", label: "Customer", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "branchLabel", label: "Branches", width: "150px", format: "muted", hideBelow: "lg" },
      { key: "tin", label: "TIN", width: "110px", format: "muted", hideBelow: "lg", defaultHidden: true },
      { key: "vatLabel", label: "VAT", width: "70px", format: "muted", align: "right", sortable: true },
      { key: "termsLabel", label: "Terms", width: "80px", format: "muted", align: "right", hideBelow: "md" },
    ],
    defaultSort: { key: "name", dir: "asc" },
    create: { label: "Customer", href: "/cocozuri/customers?new=1" },
  },

  /* Phase 3 — the money coming back in. The reference is the thing somebody
     looks for when a customer says "we paid you last Tuesday". */
  /* ⚠️ Six columns is one too many for the card at 1024px, so How and Reference
     start folded and Columns puts them back. Received · Customer · Against ·
     Amount is what somebody actually scans down. */
  cz_receipt: {
    listColumns: [
      { key: "receivedLabel", label: "Received", width: "100px", format: "muted", sortable: true },
      { key: "customerName", label: "Customer", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "invoiceNumber", label: "Against", width: "110px", format: "muted", sortable: true },
      { key: "method", label: "How", width: "110px", format: "muted", hideBelow: "md", defaultHidden: true },
      /* Kept on: it is the thing somebody looks up when a customer says "we
         paid you last Tuesday". It folds away on a phone and, on a tight
         desktop, truncates rather than pushing the customer out. */
      { key: "reference", label: "Reference", width: "130px", format: "muted", hideBelow: "lg" },
      { key: "amountLabel", label: "Amount", width: "110px", format: "muted", align: "right", sortable: true },
    ],
    defaultSort: { key: "receivedLabel", dir: "desc" },
    create: { label: "Payment", href: "/cocozuri/receipts?new=1" },
  },

  /* Manufacturing Stage 2 — what was bought.
     ⚠️ FIVE FIXED COLUMNS COME TO 430px, which fits the card at `lg` with the
     desk sidebar taking 208px. The supplier is the flexible one because it is
     what somebody scans down; adding a sixth would start squeezing it. */
  cz_purchase: {
    listColumns: [
      { key: "reference", label: "Ref", width: "90px", format: "text", sortable: true },
      { key: "purchasedLabel", label: "Bought", width: "100px", format: "muted", sortable: true },
      { key: "supplier", label: "From", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "locationName", label: "Into", width: "110px", format: "muted", hideBelow: "md", sortable: true },
      { key: "paidLabel", label: "Paid", width: "110px", format: "muted", hideBelow: "lg", defaultHidden: true },
      { key: "statusLabel", label: "Status", width: "100px", format: "status", sortable: true },
      { key: "totalLabel", label: "Total", width: "110px", format: "muted", align: "right", sortable: true },
    ],
    defaultSort: { key: "purchasedLabel", dir: "desc" },
    create: { label: "Purchase", href: "/cocozuri/purchases?new=1" },
  },

  /* Manufacturing Stage 3 — recipes.
     ⚠️ COST PER UNIT IS THE COLUMN SOMEBODY OPENS THIS PAGE FOR, so it is kept
     at every width; the yield folds away first. */
  /* Manufacturing Stage 4 — production.
     ⚠️ MADE and CAME OUT sit next to each other on purpose: the whole reason
     this record exists is the owner's "inter check", and a variance you have to
     scroll for is one nobody checks. */
  /* Manufacturing Stage 5 — kitchen to shop.
     ⚠️ SENT and ARRIVED sit side by side because the gap between them is the
     entire reason this record exists. */
  cz_transfer: {
    listColumns: [
      { key: "reference", label: "Ref", width: "110px", format: "text", sortable: true },
      { key: "onDate", label: "Sent", width: "100px", format: "muted", sortable: true },
      { key: "route", label: "From → to", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "statusLabel", label: "Status", width: "100px", format: "status", sortable: true },
      { key: "sentLabel", label: "Sent", width: "90px", format: "muted", align: "right" },
      { key: "receivedLabel", label: "Arrived", width: "90px", format: "muted", align: "right" },
      { key: "varianceLabel", label: "Lost", width: "90px", format: "muted", align: "right" },
    ],
    defaultSort: { key: "onDate", dir: "desc" },
    create: { label: "Transfer", href: "/cocozuri/transfers?new=1" },
  },

  cz_batch: {
    listColumns: [
      { key: "batchNo", label: "Batch", width: "120px", format: "text", sortable: true },
      { key: "itemName", label: "What", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "madeOn", label: "Made", width: "100px", format: "muted", sortable: true },
      { key: "statusLabel", label: "Status", width: "100px", format: "status", sortable: true },
      { key: "plannedLabel", label: "Expected", width: "90px", format: "muted", align: "right", hideBelow: "md" },
      { key: "producedLabel", label: "Came out", width: "90px", format: "muted", align: "right", sortable: true },
      { key: "varianceLabel", label: "Difference", width: "100px", format: "muted", align: "right" },
    ],
    defaultSort: { key: "madeOn", dir: "desc" },
    create: { label: "Batch", href: "/cocozuri/batches?new=1" },
  },

  cz_recipe: {
    listColumns: [
      { key: "name", label: "Recipe", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "outputItemName", label: "Makes", width: "150px", format: "muted", hideBelow: "md", sortable: true },
      { key: "yieldLabel", label: "Per batch", width: "100px", format: "muted", align: "right", hideBelow: "lg" },
      { key: "statusLabel", label: "Status", width: "90px", format: "status", sortable: true },
      { key: "batchCostLabel", label: "A batch", width: "110px", format: "muted", align: "right", sortable: true },
      { key: "unitCostLabel", label: "Each", width: "100px", format: "muted", align: "right", sortable: true },
    ],
    defaultSort: { key: "name", dir: "asc" },
    create: { label: "Recipe", href: "/cocozuri/recipes?new=1" },
  },

  cz_budget: {
    listColumns: [
      { key: "title", label: "Budget", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "periodLabel", label: "Period", width: "150px", format: "muted", sortable: true },
      { key: "locationLabel", label: "Where", width: "110px", format: "muted", hideBelow: "md" },
      { key: "statusLabel", label: "Status", width: "100px", format: "status", sortable: true },
      { key: "amountLabel", label: "Amount", width: "110px", format: "muted", align: "right", sortable: true },
      { key: "leftLabel", label: "Left", width: "110px", format: "muted", align: "right", sortable: true },
    ],
    defaultSort: { key: "periodLabel", dir: "desc" },
    create: { label: "Budget", href: "/cocozuri/budgets?new=1" },
  },

  asset: {
    listColumns: [
      { key: "name", label: "Asset", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "category", label: "Category", width: "130px", format: "muted", hideBelow: "md", sortable: true },
      { key: "assignedToName", label: "Assigned to", width: "170px", format: "people", hideBelow: "md", sortable: true },
      { key: "status", label: "Status", width: "110px", format: "status", sortable: true },
    ],
    defaultSort: { key: "name", dir: "asc" },
    create: { label: "Asset", href: "/hrms/assets?view=assets&new=asset" },
  },

  /**
   * Capital projects — the construction jobs (Phase 1 of the PES workbook).
   *
   * The columns are the SNAPSHOT sheet's header block, which is what the owner
   * reads first: which job, for whom, where it is up to, and how much time is
   * left. Money is deliberately NOT in the list. The contract is 195 million and
   * the budget 146 million; two nine-digit figures side by side in a dense row
   * are unreadable at a glance and invite mistaking one for the other. They
   * belong on the record, laid out and labelled.
   *
   * `daysRemaining` is derived, not stored (see lib/projects-shared.ts). It is
   * still a real column: the page computes it for every row and sorts on it,
   * which is how "what is running late" becomes one click instead of a read
   * through the list.
   */
  project: {
    /**
     * ⚠️ WATCH THE TOTAL FIXED WIDTH. The flexible first column gets whatever is
     * left, and there is far less room than the screen suggests: the desk
     * sidebar takes 208px and the filter rail another 184px, so a 1186px window
     * leaves the list about **725px**. Every 12px gap counts too.
     *
     * The first draft had six columns totalling 620px of fixed width; with the
     * tick box and six gaps that came to 720px, the project name was allotted
     * the remaining 5px and **collapsed to zero** — an unreadable list of blank
     * rows. Commitments, by comparison, fixes only 392px.
     *
     * Now: 434px fixed + 28 + 60 of gaps = 522, leaving ~200px for the name.
     * Company is deliberately NOT a column — the second line of the name cell
     * already carries it, and it is a filter in the rail.
     */
    listColumns: [
      { key: "name", label: "Project", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "client", label: "Client", width: "140px", format: "text", hideBelow: "md", sortable: true },
      { key: "status", label: "Status", width: "110px", format: "status", hideBelow: "sm", sortable: true },
      { key: "completionPct", label: "Complete", width: "88px", format: "number", align: "right", sortable: true },
      { key: "daysRemaining", label: "Days left", width: "96px", format: "number", align: "right", hideBelow: "sm", sortable: true },
    ],
    filters: [
      { label: "Status", source: "status" },
      { label: "Company", source: "company" },
    ],
    formSections: [
      {
        id: "identity",
        title: "Project",
        fields: [
          { key: "name", label: "Project" },
          { key: "variant", label: "Build type" },
          { key: "client", label: "Client" },
          { key: "location", label: "Location" },
          { key: "companyName", label: "Company", format: "company" },
          { key: "poNumber", label: "PO number", format: "code" },
        ],
      },
      {
        id: "programme",
        title: "Programme",
        fields: [
          { key: "startDate", label: "Start date", format: "date" },
          { key: "durationDays", label: "Duration (days)", format: "number" },
          { key: "expectedCompletion", label: "Expected completion", format: "date" },
          { key: "daysElapsed", label: "Days in progress", format: "number" },
          { key: "daysRemaining", label: "Days remaining", format: "number" },
          { key: "completionPct", label: "Work completed", format: "number" },
        ],
      },
      {
        id: "contract",
        title: "Contract",
        fields: [
          { key: "quotationValue", label: "Quotation (excl. VAT)", format: "number" },
          { key: "poValue", label: "PO value (incl. VAT)", format: "number" },
          { key: "additionalWork", label: "Additional work (incl. VAT)", format: "number" },
          { key: "totalContract", label: "Total contract", format: "number" },
          { key: "vatRate", label: "VAT rate", format: "number" },
          { key: "whtRate", label: "Withholding tax rate", format: "number" },
        ],
      },
    ],
    defaultSort: { key: "daysRemaining", dir: "asc" },  // worst-first, per DESIGN_SYSTEM.md §12
    create: { label: "Project", href: "/projects?new=1" },
  },

  /* ─────────────────────────────── the recruitment desk (Phase 1) ─────────
     Three record types, one shape. The reference and the context live on the
     row's SECOND LINE rather than in columns of their own — the same trick the
     tasks and projects lists use, and the only way a dense list still reads on
     a phone. Fixed width is kept well under 400px for the reason spelled out
     at the top of this file. */
  rec_job_order: {
    listColumns: [
      { key: "title", label: "Role", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "stage", label: "Stage", width: "150px", format: "status", hideBelow: "sm", sortable: true },
      { key: "feeTZS", label: "Fee (TZS)", width: "120px", format: "number", align: "right", sortable: true },
      { key: "targetStartOn", label: "Target start", width: "116px", format: "date", align: "right", hideBelow: "md", sortable: true },
    ],
    filters: [
      { label: "Stage", source: "status" },
    ],
    formSections: [
      {
        id: "brief",
        title: "The brief",
        fields: [
          { key: "ref", label: "Reference", format: "code" },
          { key: "clientName", label: "Client" },
          { key: "title", label: "Role" },
          { key: "sector", label: "Sector" },
          { key: "seniorityLabel", label: "Seniority" },
          { key: "stage", label: "Stage", format: "status" },
        ],
      },
      {
        id: "fee",
        title: "Salary and fee",
        fields: [
          { key: "monthlyGrossUsd", label: "Monthly gross (USD)", format: "number" },
          { key: "grossTZS", label: "Monthly gross (TZS)", format: "number" },
          { key: "feeTZS", label: "Fee — one month", format: "number" },
          { key: "vatTZS", label: "VAT at 18%", format: "number" },
          { key: "totalTZS", label: "Invoice total", format: "number" },
        ],
      },
      {
        id: "dates",
        title: "Dates",
        fields: [
          { key: "openedOn", label: "Opened", format: "date" },
          { key: "signedOn", label: "Job Order signed", format: "date" },
          { key: "targetStartOn", label: "Target start", format: "date" },
          { key: "permitExpiry", label: "Permit expires", format: "date" },
        ],
      },
    ],
    // Oldest first: the role that has been open longest is the one being let
    // down (DESIGN_SYSTEM.md §12 — worst first, everywhere).
    defaultSort: { key: "openedOn", dir: "asc" },
    create: { label: "Job order", href: "/recruitment/orders?new=1" },
  },

  rec_candidate: {
    listColumns: [
      { key: "name", label: "Candidate", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "seniorityLabel", label: "Seniority", width: "100px", format: "text", hideBelow: "md", sortable: true },
      { key: "expectedSalaryUsd", label: "Salary (USD)", width: "110px", format: "number", align: "right", sortable: true },
      { key: "passport", label: "Passport", width: "116px", format: "text", hideBelow: "sm", sortable: true },
    ],
    formSections: [
      {
        id: "who",
        title: "Who they are",
        fields: [
          { key: "name", label: "Name" },
          { key: "title", label: "Current role" },
          { key: "sector", label: "Sector" },
          { key: "seniorityLabel", label: "Seniority" },
          { key: "yearsExp", label: "Years of experience", format: "number" },
          { key: "originLabel", label: "Sourced from" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
        ],
      },
      {
        id: "travel",
        title: "Travel and identity",
        fields: [
          { key: "passportNo", label: "Passport number", format: "code" },
          { key: "passportExpiry", label: "Passport expires", format: "date" },
          { key: "ecnrLabel", label: "ECNR" },
          { key: "idVerifiedLabel", label: "Identity checked" },
          { key: "partnerName", label: "Introduced by" },
        ],
      },
      {
        id: "papers",
        title: "Papers signed",
        fields: [
          { key: "consentSignedOn", label: "Registration & Consent", format: "date" },
          { key: "engagementSignedOn", label: "Terms of Engagement", format: "date" },
        ],
      },
    ],
    defaultSort: { key: "name", dir: "asc" },
    create: { label: "Candidate", href: "/recruitment/candidates?new=1" },
  },

  rec_client: {
    listColumns: [
      { key: "name", label: "Client", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "contactName", label: "Contact", width: "150px", format: "text", hideBelow: "md", sortable: true },
      { key: "papers", label: "Papers", width: "130px", format: "text", hideBelow: "sm", sortable: true },
      { key: "openOrders", label: "Open roles", width: "100px", format: "number", align: "right", sortable: true },
    ],
    formSections: [
      {
        id: "who",
        title: "The employer",
        fields: [
          { key: "name", label: "Client" },
          { key: "sector", label: "Sector" },
          { key: "city", label: "City" },
          { key: "contactName", label: "Contact" },
          { key: "contactEmail", label: "Email" },
          { key: "contactPhone", label: "Phone" },
        ],
      },
      {
        id: "papers",
        title: "Papers signed",
        fields: [
          { key: "termsSignedOn", label: "Terms of Business", format: "date" },
          { key: "dsaSignedOn", label: "Data Sharing Agreement", format: "date" },
        ],
      },
      {
        id: "ratio",
        title: "Head count",
        fields: [
          { key: "localEmployees", label: "Tanzanian staff", format: "number" },
          { key: "foreignEmployees", label: "Foreign staff", format: "number" },
          { key: "ratioText", label: "10:1 ratio", full: true },
        ],
      },
    ],
    defaultSort: { key: "name", dir: "asc" },
    create: { label: "Recruitment client", href: "/recruitment/clients?new=1" },
  },

  commitment: {
    listColumns: [
      { key: "title", label: "Commitment", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "companyName", label: "Company", width: "160px", format: "company", hideBelow: "md", sortable: true },
      { key: "endDate", label: "Ends", width: "116px", format: "date", align: "right", hideBelow: "sm", sortable: true },
      { key: "noticeBy", label: "Notice by", width: "116px", format: "date", align: "right", sortable: true },
    ],
    defaultSort: { key: "noticeBy", dir: "asc" },
    create: { label: "Commitment", href: "/hrms/commitments?new=1" },
  },

  pipeline: {
    listColumns: [
      { key: "title", label: "Application", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "companyName", label: "Company", width: "160px", format: "company", hideBelow: "md", sortable: true },
      { key: "stage", label: "Stage", width: "150px", format: "status", hideBelow: "sm", sortable: true },
      { key: "dueDate", label: "Due", width: "116px", format: "date", align: "right", sortable: true },
    ],
    defaultSort: { key: "dueDate", dir: "asc" },
    create: { label: "Application", href: "/hrms/pipeline?new=1" },
  },

  /* Notes (Phase 1 — memory/notes_module_plan.md). The `create` line is the whole
     reason this entry earns its place today: it puts "Note" in the global New menu
     and in ⌘K at the same moment, with nothing else to edit. `?new=1` is the same
     convention every other creatable uses. */
  note: {
    listColumns: [
      { key: "displayTitle", label: "Note", width: "minmax(0,1.4fr)", format: "text", sortable: true },
      { key: "snippet", label: "First line", width: "minmax(0,1fr)", format: "text", hideBelow: "md" },
      { key: "folderName", label: "Folder", width: "150px", format: "text", hideBelow: "lg", sortable: true },
      { key: "updatedAt", label: "Updated", width: "116px", format: "date", align: "right", sortable: true },
    ],
    defaultSort: { key: "updatedAt", dir: "desc" },
    create: { label: "Note", href: "/notes?new=1" },
  },
};

/* ------------------------------------------------------------ creatables --- */

/**
 * Things you can raise that are NOT indexed entities, so they have no
 * `EntityType` and cannot live in ENTITY_VIEWS above. Kept here anyway, beside
 * the others, so the New menu still has exactly ONE place to add to.
 */
const EXTRA_CREATES: { id: string; create: CreateDef }[] = [
  { id: "event", create: { label: "Event", href: "/calendar?new=1" } },
  { id: "announcement", create: { label: "Announcement", href: "/announcements?new=1" } },
];

/** Menu order — the things raised most often first, not alphabetical. */
const CREATE_ORDER = [
  // "note" sits second on purpose: capturing a rough thought is the second most
  // common thing the owner starts from scratch, after raising a task.
  "task", "note", "event", "person", "document", "company",
  "vendor", "asset", "commitment", "pipeline", "announcement",
];

export type Creatable = { id: string; label: string; href: string };

/**
 * Every record type the owner can raise, in menu order.
 *
 * FORWARD RULE: give a new record type a `create` on its ENTITY_VIEWS entry
 * (or an EXTRA_CREATES row if it has no EntityDef) and it appears in the global
 * New menu and in ⌘K at the same moment. Nothing else to edit.
 */
export function creatables(): Creatable[] {
  const all: Creatable[] = [
    ...Object.entries(ENTITY_VIEWS)
      .filter(([, v]) => v?.create)
      .map(([id, v]) => ({ id, label: v!.create!.label, href: v!.create!.href })),
    ...EXTRA_CREATES.map((e) => ({ id: e.id, label: e.create.label, href: e.create.href })),
  ];
  const rank = (id: string) => {
    const i = CREATE_ORDER.indexOf(id);
    return i === -1 ? CREATE_ORDER.length : i;   // anything new sorts to the end
  };
  return all.sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label));
}

/** The view for an entity, or undefined if it hasn't been given a screen yet. */
export function entityView(type: EntityType): EntityView | undefined {
  return ENTITY_VIEWS[type];
}
