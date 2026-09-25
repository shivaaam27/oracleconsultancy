/**
 * The icon for each kind of ORI automation (the labels live with the describer,
 * src/app/ori-automations/describe.ts, which is server-only). Client-safe.
 */
import {
  Eye, BellRing, MessageSquareWarning, ArrowUpCircle, CalendarPlus,
  Repeat, PlaySquare, DoorClosed, UserCog, Cog, ListChecks, type LucideIcon,
} from "lucide-react";

const KIND_ICON: Record<string, LucideIcon> = {
  watch: Eye,
  reminder_before_deadline: BellRing,
  nudge_until_update: MessageSquareWarning,
  escalate_if_no_update: ArrowUpCircle,
  create_event_after_deadline: CalendarPlus,
  auto_close_stale: DoorClosed,
  auto_reassign_on_leave: UserCog,
  recurring_task: Repeat,
  scheduled_macro: PlaySquare,
  smart_reminder: BellRing,
  escalation_ladder: ListChecks,
};

export const kindIcon = (kind: string): LucideIcon => KIND_ICON[kind] ?? Cog;

/** Client-safe "3 days ago" for an ISO or date-only string. */
export function relTime(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = now - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
