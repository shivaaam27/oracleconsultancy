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

export type EntityView = {
  listColumns: ListColumnDef[];
  filters?: FilterGroupDef[];
  formSections?: FormSectionDef[];
  defaultSort?: { key: string; dir: "asc" | "desc" };
};

/**
 * One entry per entity that has a screen. Adding an entity here is what earns
 * it an ERPNext-shaped list and record — no new components.
 */
export const ENTITY_VIEWS: Partial<Record<EntityType, EntityView>> = {
  task: {
    listColumns: [
      { key: "actionItem", label: "Task", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "status", label: "Status", width: "150px", format: "status", sortable: true },
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
  },

  company: {
    listColumns: [
      { key: "name", label: "Company", width: "minmax(0,1fr)", format: "company", sortable: true },
      { key: "openTasks", label: "Open", width: "80px", format: "number", align: "right", sortable: true },
      { key: "overdue", label: "Overdue", width: "90px", format: "number", align: "right", sortable: true },
      { key: "people", label: "People", width: "80px", format: "number", align: "right", hideBelow: "md", sortable: true },
    ],
    defaultSort: { key: "name", dir: "asc" },
  },

  document: {
    listColumns: [
      { key: "title", label: "Document", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "category", label: "Category", width: "140px", format: "muted", hideBelow: "md", sortable: true },
      { key: "expiryDate", label: "Expires", width: "130px", format: "date", align: "right", sortable: true },
      { key: "status", label: "Status", width: "104px", format: "status" },
    ],
    filters: [
      { label: "Category", source: "category" },
      { label: "Company", source: "company" },
    ],
    defaultSort: { key: "expiryDate", dir: "asc" },
  },

  vendor: {
    listColumns: [
      { key: "name", label: "Vendor", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "category", label: "Category", width: "150px", format: "muted", hideBelow: "md", sortable: true },
      { key: "companyName", label: "Company", width: "160px", format: "company", hideBelow: "lg", sortable: true },
      { key: "contact", label: "Contact", width: "170px", format: "muted", hideBelow: "md" },
    ],
    defaultSort: { key: "name", dir: "asc" },
  },

  asset: {
    listColumns: [
      { key: "name", label: "Asset", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "category", label: "Category", width: "130px", format: "muted", hideBelow: "md", sortable: true },
      { key: "assignedToName", label: "Assigned to", width: "170px", format: "people", hideBelow: "md", sortable: true },
      { key: "status", label: "Status", width: "110px", format: "status", sortable: true },
    ],
    defaultSort: { key: "name", dir: "asc" },
  },

  commitment: {
    listColumns: [
      { key: "title", label: "Commitment", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "companyName", label: "Company", width: "160px", format: "company", hideBelow: "md", sortable: true },
      { key: "endDate", label: "Ends", width: "116px", format: "date", align: "right", sortable: true },
      { key: "noticeBy", label: "Notice by", width: "116px", format: "date", align: "right", sortable: true },
    ],
    defaultSort: { key: "noticeBy", dir: "asc" },
  },

  pipeline: {
    listColumns: [
      { key: "title", label: "Application", width: "minmax(0,1fr)", format: "text", sortable: true },
      { key: "companyName", label: "Company", width: "160px", format: "company", hideBelow: "md", sortable: true },
      { key: "stage", label: "Stage", width: "150px", format: "status", sortable: true },
      { key: "dueDate", label: "Due", width: "116px", format: "date", align: "right", sortable: true },
    ],
    defaultSort: { key: "dueDate", dir: "asc" },
  },
};

/** The view for an entity, or undefined if it hasn't been given a screen yet. */
export function entityView(type: EntityType): EntityView | undefined {
  return ENTITY_VIEWS[type];
}
