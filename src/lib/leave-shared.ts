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
