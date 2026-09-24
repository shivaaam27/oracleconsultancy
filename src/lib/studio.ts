/**
 * Studio — the redesign that follows the Superpower-style mockup
 * (design/studio-mockup, published canvas linked from its README).
 *
 * ⚠️ EVERY PAGE SWITCHES ON BY ITSELF. The owner's rule: the page he uses today
 * keeps working until the new one has earned its place. Each page in the plan
 * has an id here; Settings → General → "New look" stores the ids that are on
 * (`ui.studioPages`, a comma list). A page nobody has switched on renders
 * exactly as before — nothing reads this list except the pages being rebuilt.
 *
 * Pure and client-safe: no database, no server imports.
 */

export type StudioPage = {
  id: string;
  label: string;
  /** Build-plan phase (design/studio-mockup/boards/Plan.dc.html). */
  phase: number;
  /** Built and ready to try. Only ready pages can be switched on. */
  ready: boolean;
};

export const STUDIO_PAGES: StudioPage[] = [
  { id: "tasks", label: "Tasks", phase: 1, ready: true },
  { id: "nav", label: "Footer navigation", phase: 2, ready: false },
  { id: "home", label: "Home", phase: 3, ready: false },
  { id: "recurring", label: "Recurring tasks", phase: 4, ready: false },
  { id: "calendar", label: "Calendar", phase: 4, ready: false },
  { id: "brief", label: "Director Brief", phase: 4, ready: false },
  { id: "announcements", label: "Announcements", phase: 4, ready: false },
  { id: "outbox", label: "Outbox", phase: 4, ready: false },
  { id: "notes", label: "Notes", phase: 4, ready: false },
  { id: "people", label: "People", phase: 5, ready: false },
  { id: "companies", label: "Companies", phase: 5, ready: false },
  { id: "documents", label: "Documents", phase: 5, ready: false },
  { id: "assets", label: "Assets & Vendors", phase: 5, ready: false },
  { id: "attendance", label: "Attendance", phase: 6, ready: false },
  { id: "supplies", label: "Supplies", phase: 6, ready: false },
  { id: "cleaning", label: "Cleaning", phase: 6, ready: false },
  { id: "insights", label: "Insights", phase: 7, ready: false },
  { id: "activity", label: "Activity log", phase: 7, ready: false },
  { id: "ori", label: "ORI Automation", phase: 7, ready: false },
  { id: "settings", label: "Settings", phase: 7, ready: false },
];

const KNOWN = new Map(STUDIO_PAGES.map((p) => [p.id, p]));

/** The ids that are switched on. Unknown ids are dropped, and so is any page
 *  that is not ready yet — a stale setting can never turn on half a page. */
export function parseStudioPages(raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim();
    const page = KNOWN.get(id);
    if (page && page.ready) out.add(id);
  }
  return out;
}

/** Stored form: known ids only, in plan order, so the value is stable. */
export function serializeStudioPages(ids: Iterable<string>): string {
  const want = new Set(ids);
  return STUDIO_PAGES.filter((p) => want.has(p.id)).map((p) => p.id).join(",");
}

export function isStudioOn(raw: string | null | undefined, id: string): boolean {
  return parseStudioPages(raw).has(id);
}
