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
      { key: "status", label: "Status", width: "132px", format: "status", hideBelow: "sm", sortable: true },
      { key: "deadline", label: "Deadline", width: "104px", format: "date", sortable: true },
      { key: "assignees", label: "Who", width: "76px", format: "people", align: "right", hideBelow: "md", sortable: true },
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
    create: { label: "Document", href: "/files" },
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


  /* Phase 3 — the money coming back in. The reference is the thing somebody
     looks for when a customer says "we paid you last Tuesday". */
  /* ⚠️ Six columns is one too many for the card at 1024px, so How and Reference
     start folded and Columns puts them back. Received · Customer · Against ·
     Amount is what somebody actually scans down. */

  /* Manufacturing Stage 2 — what was bought.
     ⚠️ FIVE FIXED COLUMNS COME TO 430px, which fits the card at `lg` with the
     desk sidebar taking 208px. The supplier is the flexible one because it is
     what somebody scans down; adding a sixth would start squeezing it. */

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


  /* ─────────────────────────────── the recruitment desk (Phase 1) ─────────
     Three record types, one shape. The reference and the context live on the
     row's SECOND LINE rather than in columns of their own — the same trick the
     tasks and projects lists use, and the only way a dense list still reads on
     a phone. Fixed width is kept well under 400px for the reason spelled out
     at the top of this file. */



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
/**
 * The New menu, in order.
 *
 * ⚠️ IT IS A SHORTLIST, NOT EVERYTHING CREATABLE (owner, 21 Sept 2026). The menu
 * had grown to twenty-odd entries — every record type in COS, module ones
 * included — which made the seven things actually raised from scratch hard to
 * find. Vendor and Asset are still created, on their
 * own pages where the rest of that work happens; they are simply not worth a
 * line in a global menu.
 *
 * "note" sits second because capturing a rough thought is the second most
 * common thing started from nothing, after raising a task.
 *
 * ⚠️ ANYTHING NOT LISTED HERE IS LEFT OUT OF THE MENU ENTIRELY — see
 * `creatables()`. Adding a `create` to an entity no longer puts it in the menu
 * on its own, which is deliberate: the menu is chosen, not accumulated.
 */
const CREATE_ORDER = ["task", "note", "event", "person", "document", "company", "announcement"];

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
  // ⚠️ The list is the shortlist. Anything with a `create` that is not in
  // CREATE_ORDER stays out of the menu — it is still creatable on its own page.
  const rank = (id: string) => CREATE_ORDER.indexOf(id);
  return all.filter((c) => rank(c.id) !== -1).sort((a, b) => rank(a.id) - rank(b.id));
}

/** The view for an entity, or undefined if it hasn't been given a screen yet. */
export function entityView(type: EntityType): EntityView | undefined {
  return ENTITY_VIEWS[type];
}
