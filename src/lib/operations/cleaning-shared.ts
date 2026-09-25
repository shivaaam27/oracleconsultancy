// Client-safe pure helpers/types for the OCR (Office Cleaning Registry) module.
// No server imports, so usable from client components. DB access lives in
// src/lib/operations/cleaning.ts, which re-exports from here.

// Default cleaning areas, seeded on first run. Mirrors the paper register's
// columns; fully editable later in Area management.
export const DEFAULT_CLEANING_AREAS = [
  "Reception",
  "Directors Office",
  "Staff Working Area",
  "Board Room 1",
  "Board Room 2",
  "Daniel, Ashit and Jitesh Office",
  "Admin Office",
  "Kitchen",
  "Office Washroom",
  "Staff Washroom",
  "Bathing Area",
  "Outside Area",
] as const;

export type CleaningArea = {
  id: number;
  name: string;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
};

export type CleaningCheck = {
  id: number;
  dayId: number;
  areaId: number;
  done: boolean;
  doneAt: Date | null;
  comment: string | null;
};

export type CleaningDay = {
  id: number;
  date: Date;
  attendancePersonId: number | null;
  note: string | null;
  signedByPersonId: number | null;
  signedByName: string | null;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A day plus its per-area ticks (joined for the Today/History views). */
export type CleaningDayDetail = CleaningDay & { checks: CleaningCheck[] };

/** Completion against the count of areas expected that day. */
export function completion(doneCount: number, areaCount: number): { done: number; total: number; pct: number } {
  const total = areaCount;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  return { done: doneCount, total, pct };
}

export type DayStatus = "Not started" | "In progress" | "Complete" | "Signed";

export function dayStatus(d: { signedAt: Date | null }, done: number, total: number): DayStatus {
  if (d.signedAt) return "Signed";
  if (done === 0) return "Not started";
  if (done >= total && total > 0) return "Complete";
  return "In progress";
}
