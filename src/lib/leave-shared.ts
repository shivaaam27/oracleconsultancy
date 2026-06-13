/* Client-safe Leave & Attendance types, labels and tones. No server imports. */

export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export const LEAVE_STATUS_TONE: Record<LeaveStatus, "default" | "success" | "warn" | "danger" | "info"> = {
  Pending: "warn",
  Approved: "success",
  Rejected: "danger",
  Cancelled: "default",
};

export type AttendanceStatus =
  | "Present" | "Absent" | "On leave" | "Holiday" | "Remote" | "Half-day" | "Sick";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "Present", "Absent", "On leave", "Holiday", "Remote", "Half-day", "Sick",
];

export const ATTENDANCE_TONE: Record<AttendanceStatus, "default" | "success" | "warn" | "danger" | "info"> = {
  Present: "success",
  Absent: "danger",
  "On leave": "info",
  Holiday: "default",
  Remote: "info",
  "Half-day": "warn",
  Sick: "warn",
};

/** Statuses a staff member may set for themselves on the portal. */
export const ATTENDANCE_SELF_STATUSES: AttendanceStatus[] = ["Present", "Remote", "Half-day", "Sick"];

/** One-letter abbreviations for the register grid. */
export const ATTENDANCE_ABBR: Record<AttendanceStatus, string> = {
  Present: "P", Absent: "A", "On leave": "L", Holiday: "H", Remote: "R", "Half-day": "½", Sick: "S",
};

/** Tailwind cell classes for the register grid. */
export const ATTENDANCE_CELL: Record<AttendanceStatus, string> = {
  Present: "bg-success-soft text-success",
  Absent: "bg-danger-soft text-danger",
  "On leave": "bg-info-soft text-info",
  Holiday: "bg-bg-muted text-fg-subtle",
  Remote: "bg-accent-soft text-accent",
  "Half-day": "bg-warn-soft text-warn",
  Sick: "bg-warn-soft text-warn",
};

export type LeaveType = {
  id: number;
  name: string;
  color: string | null;
  paid: boolean;
  defaultDays: number;
  cycleMonths: number;
  halfPayDays: number;
  active: boolean;
};

export type LeaveRequestRow = {
  id: number;
  personId: number;
  personName: string | null;
  leaveTypeId: number;
  leaveTypeName: string | null;
  leaveTypeColor: string | null;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type Holiday = {
  id: number;
  date: string;
  name: string;
  companyId: number | null;
  companyName: string | null;
};

export type PersonLeaveBalance = {
  typeId: number;
  typeName: string;
  color: string | null;
  entitlement: number; // 0 = uncapped
  taken: number;
  pending: number;
  remaining: number | null; // null when uncapped
};
