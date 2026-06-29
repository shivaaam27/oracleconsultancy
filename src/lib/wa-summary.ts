import "server-only";
import { cache } from "react";
import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { feedForPerson, getPersonAudienceAttrs } from "@/lib/announcements";
import { getGivenName } from "@/lib/names";

// The live summary behind a person's reminder link — shared by the landing page
// (src/app/r/[p]/[t]), its refresh endpoint (/api/wa-card/data) and the preview
// image (/api/wa-card). Aggregate counts + the person's overdue list + the
// announcements reaching them (no task conversations, no other people's data).
// Server-only (postgres.js). Wrapped in React cache() so metadata + the page
// share ONE computation per request.

export type WaTopItem = { title: string; daysLate: number };
export type WaNotice = { id: number; title: string; source: string; unread: boolean };
export type WaSummary = {
  first: string;
  open: number;
  overdue: number;
  /** All overdue tasks, most-late first; the client caps how many it shows. */
  top: WaTopItem[];
  /** Announcements reaching this person — person-directed first, then pinned/newest. */
  notices: WaNotice[];
};

/** "web-ui" → Command Centre · "portal-dir:Name" → Director · "portal-mgr:Name" → Manager. */
function sourceLabel(createdBy: string): string {
  if (createdBy.startsWith("portal-dir")) return "Director";
  if (createdBy.startsWith("portal-mgr")) return "Manager";
  return "Command Centre";
}

export const loadWaSummary = cache(async (personId: number, withNotices = true): Promise<WaSummary> => {
  const { data: person } = await sb.from("people").select("id,name").eq("id", personId).maybeSingle();
  const first = getGivenName((person?.name as string | undefined) ?? "") || "You";

  const mine = (await getAllTasks()).filter((t) => isOpen(t.status) && t.assigneeIds.includes(personId));
  const overdue = mine.filter((t) => t.daysToDeadline != null && Number(t.daysToDeadline) < 0);
  const top = [...overdue]
    .sort((a, b) => Number(a.daysToDeadline) - Number(b.daysToDeadline))
    .map((t) => ({ title: t.actionItem, daysLate: Math.abs(Math.round(Number(t.daysToDeadline))) }));

  let notices: WaNotice[] = [];
  if (withNotices && personId > 0) {
    const attrs = await getPersonAudienceAttrs(personId);
    if (attrs) {
      const feed = await feedForPerson(attrs); // pinned-first, then newest
      // Surface notices aimed at this person individually ahead of broadcasts;
      // Array.sort is stable, so the feed's pinned/newest order is otherwise kept.
      const ranked = [...feed].sort(
        (a, b) => (a.audienceKind === "people" ? 0 : 1) - (b.audienceKind === "people" ? 0 : 1),
      );
      notices = ranked.map((a) => ({
        id: a.id,
        title: a.title,
        source: sourceLabel(a.createdBy),
        unread: !a.seenAt,
      }));
    }
  }

  return { first, open: mine.length, overdue: overdue.length, top, notices };
});
