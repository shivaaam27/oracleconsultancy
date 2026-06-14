/* Client-safe calendar-overlay types. No server imports. */

export type OverlayKind =
  | "task"
  | "leave"
  | "holiday"
  | "renewal"
  | "birthday"
  | "anniversary"
  | "probation"
  | "commitment"
  | "pipeline";

export type OverlayItem = {
  id: string;
  kind: OverlayKind;
  title: string;
  dayKey: string; // yyyy-mm-dd in Africa/Dar_es_Salaam
  href: string | null;
  companyId: number | null;
};

export const OVERLAY_LABELS: Record<OverlayKind, string> = {
  task: "Task deadlines",
  leave: "Leave",
  holiday: "Holidays",
  renewal: "Renewals",
  birthday: "Birthdays",
  anniversary: "Anniversaries",
  probation: "Probation ends",
  commitment: "Lease/insurance notice",
  pipeline: "Applications due",
};

/** The kinds shown as toggleable layers, in display order. */
export const OVERLAY_KINDS: OverlayKind[] = [
  "task",
  "leave",
  "holiday",
  "renewal",
  "birthday",
  "anniversary",
  "probation",
  "commitment",
  "pipeline",
];
