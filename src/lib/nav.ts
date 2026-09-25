import {
  ChefHat,
  Warehouse,
  Tag,
  Factory,
  Truck,
  Undo2,
  TrendingUp,
  Radar,
  Store,
  Filter,
  Container,
  Ship,
  ShoppingCart,
  Wallet,
  Users,
  Send,
  Settings,
  FileText,
  CalendarClock,
  Scale,
  Package,
  Laptop,
  CalendarDays,
  Sparkles,
  Building2,
  BarChart3,
  FileWarning,
  Megaphone,
  LayoutGrid,
  Camera,
  Images,
  CalendarRange,
  AtSign,
  ListChecks,
  History as HistoryIcon,
  Activity,
  Zap,
  MessageSquare,
  ClipboardList,
  KanbanSquare,
  UserSearch,
  StickyNote,
  DraftingCompass,
  Scale as ScaleIcon,
  CheckSquare,
  Repeat,
  Home,
  Briefcase,
  BookOpen,
  Handshake,
  CalendarCheck,
  Trophy,
  ClipboardCheck,
  BookText,
  Receipt,
  Percent,
  Candy,
  Banknote,
  AlarmClock,
  FileSpreadsheet,
  Boxes,
  ClipboardList as OrderIcon,
  type LucideIcon,
} from "lucide-react";

export type NavRoute = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for every "Go to" destination — the launcher grid in
 * the nav pill AND the pinnable nav rail (Settings) AND the ⌘K page-jump list
 * all read from this one list, so they can never drift apart.
 *
 * Order here is the default order. The administrator (`/`, with its Overview/
 * Companies/Tasks tabs) is reached via the Home button in the pill, so it isn't
 * listed as a destination.
 */
export const NAV_ROUTES: NavRoute[] = [
  { id: "approvals",   href: "/approvals",           label: "Approvals",           icon: ListChecks },
  // Standing repeat rules — the tasks that recreate themselves. The portal had a
  // panel for these from the start; the administrator only had ORI Automation.
  { id: "recurring",   href: "/task/recurring",      label: "Recurring tasks",     icon: Repeat },
  { id: "announcements", href: "/announcements",      label: "Announcements",       icon: Megaphone },
  { id: "tax-legal",   href: "/hrms/command-centre", label: "Tax & Legal",        icon: Scale },
  { id: "supplies",    href: "/hrms/supplies",       label: "Supplies",            icon: Package },
  { id: "assets",      href: "/hrms/assets",         label: "Assets, Tools & Vendors", icon: Laptop },
  { id: "leave",       href: "/hrms/leave",          label: "Attendance",          icon: CalendarDays },
  { id: "commitments", href: "/hrms/commitments",    label: "Commitments",         icon: FileWarning },
  // The PES trading and import business — Stage 1 is its master lists; the
  // order screens follow. See memory/pes_ops_module.md.
  /* Orders & Imports — the PES trading and import business. ⚠️ ONE ROUTE PER
     TAB, because it is a module now: the rail lists its pages the way every
     other module's does, and ⌘K can reach each of them by name. The in-page
     tab strip (`ops-tabs.tsx`) stays — the two agree because both are lists of
     the same seven addresses. */
  // accounting system now (owner, Aug 2026); see `memory/erp_gap_plan.md`.
  // "Brief" while pointing at /calendar, so the sidebar's Brief opened the diary
  // and the real Brief had no entry at all.
  { id: "calendar",    href: "/calendar",            label: "Calendar",            icon: CalendarClock },
  { id: "brief",       href: "/brief",               label: "Report",              icon: ClipboardList }, // opens the Report panel (was the Director Brief page)
  { id: "chat",        href: "/chat",                label: "Chat",                icon: MessageSquare },
  { id: "pipeline",    href: "/hrms/pipeline",       label: "Applications",        icon: KanbanSquare },
  { id: "cleaning",    href: "/hrms/cleaning",       label: "Cleaning",            icon: Sparkles },
  // See memory/recruitment_module_plan.md.
  { id: "companies",   href: "/companies",           label: "Companies",           icon: Building2 },
  { id: "people",      href: "/people",              label: "People",              icon: Users },
  { id: "documents",   href: "/files",               label: "Files Management",    icon: FileText },
  { id: "notes",       href: "/notes",               label: "Notes",               icon: StickyNote },
  { id: "outbox",      href: "/outbox",              label: "Outbox",              icon: Send },
  { id: "activity",    href: "/activity",            label: "Activity log",        icon: Activity },
  { id: "ori-automations", href: "/ori-automations", label: "ORI Automation",      icon: Zap },
  { id: "insights",    href: "/insights",            label: "Insights",            icon: BarChart3 },
  { id: "settings",    href: "/settings",            label: "Settings",            icon: Settings },

  /* Sub-pages of the Recruitment and Ledger modules.
   *
   * ⚠️ ADDING routes is safe; RENAMING one is not (see LEGACY_ROUTE_IDS below).
   * These existed as pages already and were simply unreachable from any rail —
   * you had to be on the desk and click through. Listing them here also puts
   * them in ⌘K and in the pinnable list, which is the point. */
  /* CocoZuri Operations — Phase 1. See memory/cocozuri_ops_plan.md. */
  /* ⚠️ The things you COUNT, as against the things you SELL. The only way to
     make one used to be an add-button inside a count sheet, and shelves could
     not be managed at all. */
  /* ⚠️ SHELVES HAD NO ADDRESS. They were managed in a sheet inside Stock
     items, which is not somewhere anybody finds a thing — and a shelf is set up
     BEFORE the items that sit on it, so it belongs in the rail ahead of them. */
  /* ⚠️ The words you pick from. They were free text, and the catalogue has
     five count units where it has three. */
  /* CocoZuri Operations — Phase 3: money in, what is owed, statements. */
  /* CocoZuri Operations — Phase 4: the daily stock book. */
  /* Phase 5 — what to make and send, from the shelf's own history. */
  /* ⚠️ WHAT TO MAKE TODAY, not what to buy (owner, 27 Aug 2026). The buying
     half lives at /cocozuri/order/materials and is reached from a plan whose
     materials fall short. */
  /* Manufacturing Stage 2 — what was bought, and the budget it was bought
     against. See memory/cocozuri_manufacturing_plan.md. */
  /* ⚠️ The SHARED vendor register, not a second list — it simply lived in
     another module, so from inside CocoZuri nobody could see it. */
  /* ⚠️ A PRICE IS A ROW WITH A DATE, and until now the only thing any screen
     could do was add one dated today for everybody. No customer's own price
     could be set, no date corrected, no wrong one removed. */
  /* Manufacturing Stage 3 — what a bar costs to make, before one is made. */
  /* Manufacturing Stage 4 — what was planned, what came out, and where the
     difference went. */
  /* Manufacturing Stage 5 — kitchen to shop, with what actually arrived. */
  /* Manufacturing Stage 6 — what came back, what was repacked, what was thrown. */
  /* Manufacturing Stage 7 — which chocolate makes money. */
  /* Manufacturing Stage 8 — money out, the twin of money in. */
  /* Manufacturing Stage 9 — expiry, shelf life and the batch trace. */
  /* ⚠️ What happened, and when — nothing in the module could answer it. */
  /* Manufacturing Stage 5b — what goes over a counter. ⚠️ A record, not a till. */
];

export const ROUTE_BY_ID: Record<string, NavRoute> = Object.fromEntries(
  NAV_ROUTES.map((r) => [r.id, r])
);

/**
 * ONE grouping of the system, used by every navigation surface.
 *
 * ⚠️ There used to be two maps of the same product: the desktop sidebar grouped
 * pages as Work / Records / Registers / System, while the mobile launcher grouped
 * the SAME pages into seven colour-coded "Worlds" with their own `/world/<slug>`
 * screens. The two lists never held the same pages, so a page could be in one and
 * missing from the other — which is exactly how Chat, the Director Brief and the
 * Applications board became unreachable. Worlds was retired in Aug 2026; this is
 * the single source now.
 *
 * FORWARD RULE: add a route to NAV_ROUTES, then put its id in a group below.
 * A route in neither is reachable only by typing its address.
 */
export type NavGroup = { label: string; ids: string[] };

/* ------------------------------------------------------------------ *
 * MODULES — the layer above the groups.
 *
 * The rail had grown to 23 destinations in one column, which is a list rather
 * than a filing system, and a sixth business (CocoZuri) was about to make it 24.
 * So the app is divided the way the BUSINESSES are divided, the way ERPNext
 * divides itself: a launcher of modules, and a rail that shows the module you
 * are actually in.
 *
 * ⚠️ THE ROUTE LIST ABOVE IS UNTOUCHED BY THIS, AND THAT IS THE WHOLE TRICK.
 * Not one id, address or label changed. Pins are stored as ids and silently drop
 * anything they do not recognise; ⌘K, recents and the mobile launcher all read
 * `NAV_ROUTES`. Because none of that moved, none of it breaks — a module is only
 * a way of ARRANGING routes, never a way of renaming them.
 *
 * ⚠️ Two safety nets, and both matter:
 *   1. `moduleForPath` falls back to Task Management, so an address belonging to
 *      no module can never render an empty rail.
 *   2. `NAV_GROUPS` below is DERIVED from these modules, so `ungroupedRouteIds()`
 *      still catches a route that was added and never filed — and `nav.test.ts`
 *      asserts every route lives in exactly one place.
 *
 * FORWARD RULE: a new module is one entry here. A new page inside an existing
 * module is one `NAV_ROUTES` entry plus its id in that module's groups.
 * ------------------------------------------------------------------ */

export type NavModule = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** One line on the launcher tile — what this is FOR, in plain words. */
  blurb: string;
  /** Where the tile takes you. */
  home: string;
  /** Address prefixes that mean "you are in here". Longest match wins. */
  match: string[];
  /** Links that are not `NAV_ROUTES` entries — the hub's own tabs. */
  lead?: { href: string; label: string; icon: LucideIcon }[];
  groups: NavGroup[];
  /**
   * The three or four pages people actually open, shown on the launcher tile.
   *
   * ⚠️ A LAUNCHER TILE WITH ONE DESTINATION IS A BIG BUTTON. Without these the
   * only way into a module is its front door, and the front door is almost never
   * where the work is — you go to /apps to reach the stock book, not the desk.
   *
   * Route ids, and they must belong to THIS module's own groups: `nav.test.ts`
   * proves it, so a quick link can never point into a module you are not
   * entering, and can never outlive the page it names.
   */
  quick?: string[];
  /** Shown on the launcher, kept out of the rail: the module is not built yet. */
  soon?: boolean;
};

/** Belongs to the whole app, not to any one module, so it sits at the foot of
 *  every rail. Burying Settings inside one business would be wrong. */
export const SYSTEM_GROUP: NavGroup = {
  label: "System",
  ids: ["insights", "activity", "ori-automations", "settings"],
};

export const MODULES: NavModule[] = [
  {
    id: "tasks",
    label: "Task Management",
    icon: CheckSquare,
    blurb: "The day to day — tasks, people, papers and the operational registers.",
    home: "/",
    // Deliberately no `match`: this is the fallback, so anything that belongs to
    // no other module lands here rather than nowhere.
    match: [],
    lead: [
      { href: "/", label: "Home", icon: Home },
      { href: "/?tab=tasks", label: "Tasks", icon: CheckSquare },
    ],
    quick: ["approvals", "people", "documents", "calendar"],
    groups: [
      { label: "Work", ids: ["approvals", "recurring", "notes", "outbox", "chat", "calendar", "brief", "announcements"] },
      { label: "Records", ids: ["people", "companies", "documents", "assets"] },
      // Was "Registers" until Aug 2026 — the word meant three things at once (this
      // group, the commitments page, and the legacy /registry task list). The pages
      // in here are the day-to-day operational logs, so that is what it is called.
      // ⚠️ `ops` LEFT THIS GROUP when Orders & Imports became a module of its
      // own. A route filed in two modules fails `nav.test.ts`, which is the
      // guard that exists for exactly this.
      { label: "Operations", ids: ["tax-legal", "commitments", "pipeline", "leave", "supplies", "cleaning"] },
    ],
  },

];

export const MODULE_BY_ID: Record<string, NavModule> = Object.fromEntries(
  MODULES.map((m) => [m.id, m])
);

/** The module an address belongs to. Longest prefix wins; Task Management is the
 *  fallback, so there is no such thing as a page with no rail. */
export function moduleForPath(pathname: string): NavModule {
  let best: NavModule | null = null;
  let bestLen = -1;
  for (const m of MODULES) {
    for (const prefix of m.match) {
      if ((pathname === prefix || pathname.startsWith(prefix + "/")) && prefix.length > bestLen) {
        best = m;
        bestLen = prefix.length;
      }
    }
  }
  return best ?? MODULE_BY_ID.tasks!;
}

/**
 * A module's OWN groups — the scrolling half of the rail. System is deliberately
 * not here.
 *
 * ⚠️ SYSTEM MUST NOT SCROLL OFF THE BOTTOM. It was the last entry in one long
 * scrolling column, which is not the same as being pinned: measured 28 Aug 2026
 * at 1440×900, CocoZuri's rail stood 1281px tall in a 696px column, so Settings,
 * Insights, Activity and ORI were invisible in every module and five of the
 * module's own groups were too. Splitting the two is what lets the foot stay put
 * while the module's pages scroll above it.
 */
export function moduleOwnGroups(m: NavModule): { label: string; items: NavRoute[] }[] {
  return m.groups
    .map((g) => ({ label: g.label, items: g.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean) }))
    .filter((g) => g.items.length > 0);
}

/** The System routes, pinned at the foot of every rail. */
export function systemItems(): NavRoute[] {
  return SYSTEM_GROUP.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
}

/** One module's rail: its own groups, then System underneath. */
export function moduleGroups(m: NavModule): { label: string; items: NavRoute[] }[] {
  const system = systemItems();
  return [
    ...moduleOwnGroups(m),
    ...(system.length ? [{ label: SYSTEM_GROUP.label, items: system }] : []),
  ];
}

/** A module's launcher shortcuts, resolved to real routes. */
export function moduleQuick(m: NavModule): NavRoute[] {
  return (m.quick ?? []).map((id) => ROUTE_BY_ID[id]).filter(Boolean);
}

/**
 * Every group in the system, DERIVED from the modules.
 *
 * ⚠️ Derived, not written out again. The mobile launcher shows the whole map on
 * one screen (there is no rail on a phone to be scoped), and it must never fall
 * out of step with the modules — which is exactly what happened the last time
 * two lists described the same product. See the note on NAV_GROUPS' history.
 */
export const NAV_GROUPS: NavGroup[] = [...MODULES.flatMap((m) => m.groups), SYSTEM_GROUP];

/**
 * The whole map, for a screen with no rail — the mobile "Go to" launcher.
 *
 * ⚠️ SECTIONED BY MODULE, not by the modules' internal group names. On a phone
 * there is no switcher and no context, so a heading reading "Desk" or "Books"
 * would say nothing about which business it belongs to. Task Management keeps
 * its own Work / Records / Operations headings because it is large and those
 * words are already familiar; the smaller modules collapse to one section named
 * after the module.
 */
export function navSections(): { label: string; items: NavRoute[] }[] {
  const out: { label: string; items: NavRoute[] }[] = [];
  for (const m of MODULES) {
    if (m.soon) continue;
    const ids = m.groups.flatMap((g) => g.ids);
    if (ids.length === 0) continue;
    if (m.match.length === 0) {
      // The fallback module (Task Management) keeps its own headings.
      for (const g of m.groups) {
        const items = g.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
        if (items.length) out.push({ label: g.label, items });
      }
    } else {
      const items = ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
      if (items.length) out.push({ label: m.label, items });
    }
  }
  const system = SYSTEM_GROUP.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
  if (system.length) out.push({ label: SYSTEM_GROUP.label, items: system });
  return out;
}

/** The groups resolved to real routes, skipping any id that no longer exists. */
export function navGroups(): { label: string; items: NavRoute[] }[] {
  return NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean),
  })).filter((g) => g.items.length > 0);
}

/** Every route that isn't in a group — a build-time safety net for the sweep above. */
export function ungroupedRouteIds(): string[] {
  const grouped = new Set(NAV_GROUPS.flatMap((g) => g.ids));
  return NAV_ROUTES.filter((r) => !grouped.has(r.id)).map((r) => r.id);
}

// "inbox" was pinned here until Aug 2026, when the intake page was removed —
// a pin for a route that no longer exists just silently vanishes from the rail.
export const DEFAULT_PINS = ["approvals", "outbox", "chat"];

/**
 * Renamed route ids → their new id.
 *
 * Pins are stored in the database as a list of ids, and anything unrecognised is
 * dropped on load. So renaming an id would quietly un-pin whatever the owner had
 * pinned — the very failure the note above records. Run stored ids through
 * `resolveRouteId` and an old pin simply follows its page to the new name.
 *
 * FORWARD RULE: rename a route id, add a line here. Never just rename it.
 */
export const LEGACY_ROUTE_IDS: Record<string, string> = {
  ocr: "cleaning",        // Office Cleaning Registry → Cleaning (Aug 2026)
  oecr: "supplies",       // Office Equipment Control Registry → Supplies (Aug 2026)
  registers: "commitments", // Commitments register → Commitments (Aug 2026)
};

/** A stored id resolved to a live one, following any rename. */
export function resolveRouteId(id: string): string {
  return LEGACY_ROUTE_IDS[id] ?? id;
}
