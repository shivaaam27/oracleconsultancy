/**
 * Small, pure helpers the Studio task screens share: how a status, a deadline,
 * a person and a time read. Client-safe.
 */
import type { TaskRow } from "@/lib/tasks/queries";

export const STATUS_DOT: Record<string, string> = {
  "Not Started": "#B9BBBF",
  "In Progress": "#2490EF",
  "Under Review": "#8B5CF6",
  "Blocked": "#E0479E",
  "Waiting External": "#F5A524",
  "Escalated": "#F0703A",
  "Completed": "#19C37D",
  "Closed": "#5B5E63",
};

export type DueTone = "late" | "soon" | "ok" | "none" | "done";

/** The deadline in words, with the colour to show it in on a white row
 *  (`onPage`) and on a dark card (`onCard`). */
export function deadlineWords(t: Pick<TaskRow, "deadline" | "daysToDeadline" | "flag" | "status">): { words: string; tone: DueTone; onPage: string; onCard: string } {
  const done = t.status === "Completed" || t.status === "Closed";
  if (done) return { words: "Done", tone: "done", onPage: "var(--st-ok-text)", onCard: "#5BE0A5" };
  if (!t.deadline) return { words: "No date", tone: "none", onPage: "var(--st-muted)", onCard: "#A3A6AB" };
  const d = typeof t.daysToDeadline === "number" ? t.daysToDeadline : null;
  const date = new Date(t.deadline).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  if (d !== null && d < 0) {
    const n = -d;
    return { words: `${n}d late`, tone: "late", onPage: "var(--st-late-text)", onCard: "#F07BBE" };
  }
  if (d === 0) return { words: "Today", tone: "soon", onPage: "var(--st-soon-text)", onCard: "#F5B94E" };
  if (t.flag === "due-soon") return { words: date, tone: "soon", onPage: "var(--st-soon-text)", onCard: "#F5B94E" };
  return { words: date, tone: "ok", onPage: "var(--st-ink)", onCard: "#C9CBCF" };
}

export function initials(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/^(Mr|Mrs|Ms|Miss|Dr|Chef)\.?\s+/i, "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const TINTS = ["#9FE2C2", "#C9D8FF", "#FFD7A1", "#F8C4DE", "#D9CCFF", "#BFE7F2", "#E7E3A6", "#FBD0C0", "#CDE7B0", "#F6D2A8", "#C8E0F4", "#E4CCF2"];
/** A stable pastel per person, so the same person is always the same colour. */
export function avatarTint(name: string | null | undefined): string {
  let h = 0;
  for (const ch of name ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}
