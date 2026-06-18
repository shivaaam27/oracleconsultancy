import "server-only";
import { sb } from "@/db/supabase";
import type { PortalRole } from "@/lib/portal-auth";

/* ------------------------------------------------------------------ *
 * Onboarding tours + feature spotlights. Definitions live in the
 * `tours` table (data, not code); `tour_completions` is the per-person
 * "seen" ledger (person_id NULL = owner/admin). See
 * memory/onboarding_tours.md.
 * ------------------------------------------------------------------ */

export type TourAudience = "staff" | "manager" | "director" | "owner";
export type TourKind = "tour" | "spotlight";

export type TourStep = {
  /** The `data-tour="…"` tag of the element to point at. */
  target: string;
  title: string;
  body: string;
  /** Preferred bubble side; the client clamps to the viewport. */
  placement?: "top" | "bottom" | "left" | "right" | "auto";
};

export type Tour = {
  key: string;
  audience: TourAudience;
  kind: TourKind;
  version: number;
  route: string;
  title: string | null;
  body: string | null;
  steps: TourStep[];
};

/** Portal role → tour audience. Owner/admin uses audience "owner" (handled
 *  separately on the admin side). */
export function audienceForRole(role: PortalRole): TourAudience {
  // hr is a staff-shaped surface; it sees the staff tour. manager/director have
  // their own. (Unknown roles fall back to staff.)
  return role === "manager" || role === "director" ? role : "staff";
}

function rowToTour(r: Record<string, unknown>): Tour {
  return {
    key: r.key as string,
    audience: r.audience as TourAudience,
    kind: (r.kind as TourKind) ?? "tour",
    version: (r.version as number) ?? 1,
    route: r.route as string,
    title: (r.title as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    steps: Array.isArray(r.steps) ? (r.steps as TourStep[]) : [],
  };
}

/** Active tours for an audience that this person has NOT yet completed.
 *  `personId` is null for the owner/admin. Best-effort: any DB hiccup returns
 *  an empty list (a tour is never important enough to break a page). */
export async function unseenToursFor(
  audience: TourAudience,
  personId: number | null,
): Promise<Tour[]> {
  try {
    const { data: tourRows } = await sb
      .from("tours")
      .select("key,audience,kind,version,route,title,body,steps")
      .eq("audience", audience)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    const tours = (tourRows ?? []).map(rowToTour);
    if (tours.length === 0) return [];

    const seen = await completedKeys(personId);
    return tours.filter((t) => !seen.has(`${t.key}@${t.version}`));
  } catch {
    return [];
  }
}

/** All spotlights for an audience (the "What's new" archive), newest-first by
 *  sort_order then key. Includes seen ones — the archive stays browsable. */
export async function spotlightsFor(audience: TourAudience): Promise<Tour[]> {
  try {
    const { data } = await sb
      .from("tours")
      .select("key,audience,kind,version,route,title,body,steps")
      .eq("audience", audience)
      .eq("kind", "spotlight")
      .eq("is_active", true)
      .order("sort_order", { ascending: false });
    return (data ?? []).map(rowToTour);
  } catch {
    return [];
  }
}

/** Set of "<key>@<version>" this person has already dismissed. */
async function completedKeys(personId: number | null): Promise<Set<string>> {
  const q = sb.from("tour_completions").select("tour_key,version");
  const { data } = personId == null
    ? await q.is("person_id", null)
    : await q.eq("person_id", personId);
  return new Set((data ?? []).map((r) => `${r.tour_key as string}@${r.version as number}`));
}

/** Record that a person finished/dismissed a tour. Check-then-insert (the
 *  "seen" ledger uses partial unique indexes that PostgREST can't target for an
 *  upsert; reads dedupe via a Set, so a rare race that double-inserts is
 *  harmless). */
export async function markTourSeen(
  personId: number | null,
  tourKey: string,
  version: number,
): Promise<void> {
  const existing = personId == null
    ? sb.from("tour_completions").select("id").is("person_id", null).eq("tour_key", tourKey).eq("version", version)
    : sb.from("tour_completions").select("id").eq("person_id", personId).eq("tour_key", tourKey).eq("version", version);
  const { data } = await existing.limit(1);
  if (data && data.length > 0) return;
  await sb.from("tour_completions").insert({
    person_id: personId,
    tour_key: tourKey,
    version,
    dismissed_at: new Date().toISOString(),
  });
}
