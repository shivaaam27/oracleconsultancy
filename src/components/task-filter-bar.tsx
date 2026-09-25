/* The shapes the Tasks filter row is built from — a counting chip (a chip = a
 * filter), a picker option, and the identity strip shown when a company or
 * person is picked. All state lives in the URL (the server renders the hrefs).
 * The old filter bar that drew them is gone; the Studio task controls use these. */

export type FilterChip = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
  tone?: "danger" | "warn" | "info" | "success" | "default";
};

export type FilterOption = { key: string; label: string; count?: number; href: string; active: boolean };

export type IdentityStrip = {
  kind: "company" | "person";
  title: string;
  sub: string;
  logoUrl?: string | null;
  accent?: string | null;
  clearHref: string;
  /** Person strip only — the Assigned | Created by toggle. */
  segments?: Array<{ label: string; href: string; active: boolean }>;
  /** Person strip only — task id used to draft the consolidated reminder. */
  remindTaskId?: number | null;
  lateCount?: number;
};
