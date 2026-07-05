import "server-only";
import { sb } from "@/db/supabase";
import { getAppSettings } from "./settings";
import { companyScope, seesAllCompanies, visibleTaskIds, type PortalPerson } from "./portal-auth";

/* ------------------------------------------------------------------ *
 * Portal task nudges — the small "you have tasks to look at" banner that
 * sits above every portal hero (home + board). Computed fresh on each
 * load from task timestamps; no cron, no new table.
 *
 *  - Not started: tasks in the viewer's SCOPE (company-wise for
 *    managers/directors/HR, own tasks for staff) still at "Not Started"
 *    and untouched for ≥ N hours.
 *  - No update: tasks the viewer RAISED (created) that are open, past the
 *    Not-Started stage, and have had no activity for ≥ N days
 *    (management roles only — it's about delegated work).
 *
 * "Untouched / no activity" = the later of last_updated_at / created_date
 * is older than the cutoff. All thresholds + wording live in Settings →
 * Portals (see lib/settings.ts portalNudge* keys).
 * ------------------------------------------------------------------ */

export type PortalNudge = {
  notStarted: number;
  noUpdate: number;
  notStartedMsg: string;
  noUpdateMsg: string;
  notStartedHref: string;
  noUpdateHref: string;
};

/** PostgREST OR-filter: the row's last touch (last_updated_at, else created_date)
 *  is before `iso`. Two arms because a never-updated task has a null
 *  last_updated_at, so we fall back to created_date for those. */
function staleBefore(iso: string): string {
  return `last_updated_at.lt.${iso},and(last_updated_at.is.null,created_date.lt.${iso})`;
}

export async function getPortalNudge(me: PortalPerson): Promise<PortalNudge | null> {
  const s = await getAppSettings();
  if (!s.portalNudges) return null;

  const now = Date.now();
  const nsCut = new Date(now - Math.max(0, s.portalNudgeNotStartedHours) * 3_600_000).toISOString();
  const nuCut = new Date(now - Math.max(0, s.portalNudgeNoUpdateDays) * 86_400_000).toISOString();
  const isManagement = me.portalRole !== "staff";

  // ── Not started (scope-aware) ──────────────────────────────────────────────
  let notStarted = 0;
  const base = () =>
    sb.from("tasks").select("id", { count: "exact", head: true })
      .eq("archived", false)
      .eq("status", "Not Started")
      .or(staleBefore(nsCut));

  if (seesAllCompanies(me)) {
    const { count } = await base();
    notStarted = count ?? 0;
  } else {
    const scope = await companyScope(me); // [] = staff, [ids] = manager / scoped director
    if (scope && scope.length > 0) {
      const { count } = await base().in("company_id", scope);
      notStarted = count ?? 0;
    } else {
      // Staff: only their own tasks (owner or assignee) — use their visible set.
      const ids = await visibleTaskIds(me);
      if (ids.length) {
        const { count } = await base().in("id", ids);
        notStarted = count ?? 0;
      }
    }
  }

  // ── No update on tasks they raised (management only) ────────────────────────
  let noUpdate = 0;
  if (isManagement) {
    const { count } = await sb
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("archived", false)
      .eq("created_by_person_id", me.id)
      .not("status", "in", "(Completed,Closed)")
      .neq("status", "Not Started") // the Not-Started line already covers these
      .or(staleBefore(nuCut));
    noUpdate = count ?? 0;
  }

  if (notStarted === 0 && noUpdate === 0) return null;

  return {
    notStarted,
    noUpdate,
    notStartedMsg: s.portalNudgeNotStartedMsg,
    noUpdateMsg: s.portalNudgeNoUpdateMsg,
    // Deep-link into the filters we surface on the Tasks tab.
    notStartedHref: "/portal/tasks?filter=notstarted",
    noUpdateHref: "/portal/tasks?filter=fromme",
  };
}
