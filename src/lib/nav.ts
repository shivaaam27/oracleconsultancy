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
 * Order here is the default order. The command centre (`/`, with its Overview/
 * Companies/Tasks tabs) is reached via the Home button in the pill, so it isn't
 * listed as a destination.
 */
export const NAV_ROUTES: NavRoute[] = [
  { id: "approvals",   href: "/approvals",           label: "Approvals",           icon: ListChecks },
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
  { id: "ops",          href: "/ops",                 label: "Orders",              icon: Ship },
  { id: "ops-funnel",   href: "/ops/funnel",          label: "Funnel",              icon: Filter },
  { id: "ops-imports",  href: "/ops/imports",         label: "Imports",             icon: Container },
  { id: "ops-invoices", href: "/ops/invoices",        label: "Delivery & billing",  icon: Receipt },
  { id: "ops-payments", href: "/ops/payments",        label: "Payments",            icon: Banknote },
  { id: "ops-report",   href: "/ops/report",          label: "Report",              icon: BarChart3 },
  { id: "ops-setup",    href: "/ops/setup",           label: "Setup",               icon: ListChecks },
  // The general ledger — chart of accounts, journals, entries. COS is the
  // accounting system now (owner, Aug 2026); see `memory/erp_gap_plan.md`.
  { id: "ledger",      href: "/ledger",              label: "Ledger",              icon: ScaleIcon },
  // ⚠️ "Brief" means the DIRECTOR BRIEF at /brief. This entry used to be labelled
  // "Brief" while pointing at /calendar, so the sidebar's Brief opened the diary
  // and the real Brief had no entry at all.
  { id: "calendar",    href: "/calendar",            label: "Calendar",            icon: CalendarClock },
  { id: "brief",       href: "/brief",               label: "Director Brief",      icon: ClipboardList },
  { id: "chat",        href: "/chat",                label: "Chat",                icon: MessageSquare },
  { id: "pipeline",    href: "/hrms/pipeline",       label: "Applications",        icon: KanbanSquare },
  { id: "cleaning",    href: "/hrms/cleaning",       label: "Cleaning",            icon: Sparkles },
  { id: "projects",    href: "/projects",            label: "Projects",            icon: DraftingCompass },
  // Oracle Consultancy's recruitment agency — India to Tanzania sourcing.
  // See memory/recruitment_module_plan.md.
  { id: "recruitment", href: "/recruitment",         label: "Recruitment",         icon: UserSearch },
  { id: "marketing",           href: "/marketing",           label: "Overview",         icon: LayoutGrid },
  { id: "mkt-posts",           href: "/marketing/posts",     label: "Posts",            icon: Send },
  { id: "mkt-calendar",        href: "/marketing/calendar",  label: "Calendar",         icon: CalendarRange },
  { id: "mkt-accounts",        href: "/marketing/accounts",  label: "Accounts",         icon: AtSign },
  { id: "mkt-clients",         href: "/marketing/clients",   label: "Clients",          icon: Handshake },
  { id: "mkt-campaigns",       href: "/marketing/campaigns", label: "Campaigns",        icon: Megaphone },
  { id: "mkt-shoots",          href: "/marketing/shoots",    label: "Shoots",           icon: Camera },
  { id: "mkt-library",         href: "/marketing/library",   label: "Pictures",         icon: Images },
  { id: "mkt-results",         href: "/marketing/results",   label: "Results",          icon: BarChart3 },
  { id: "companies",   href: "/companies",           label: "Companies",           icon: Building2 },
  { id: "people",      href: "/people",              label: "People",              icon: Users },
  { id: "documents",   href: "/documents",           label: "Documents",           icon: FileText },
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
  { id: "rec-orders",     href: "/recruitment/orders",     label: "Job orders",   icon: Briefcase },
  { id: "rec-candidates", href: "/recruitment/candidates", label: "Candidates",   icon: Users },
  { id: "rec-clients",    href: "/recruitment/clients",    label: "Clients",      icon: Handshake },
  { id: "rec-shortlists", href: "/recruitment/shortlists", label: "Shortlists",   icon: ClipboardCheck },
  { id: "rec-interviews", href: "/recruitment/interviews", label: "Interviews",   icon: CalendarCheck },
  { id: "rec-placements", href: "/recruitment/placements", label: "Placements",   icon: Trophy },

  { id: "ledger-journals", href: "/ledger/journals",       label: "Journals",     icon: BookText },
  { id: "ledger-entries",  href: "/ledger/entries",        label: "Entries",      icon: Receipt },
  { id: "ledger-reports",  href: "/ledger/reports",        label: "Reports",      icon: BarChart3 },
  { id: "ledger-tax",      href: "/ledger/tax",            label: "Tax rates",    icon: Percent },

  /* CocoZuri Operations — Phase 1. See memory/cocozuri_ops_plan.md. */
  { id: "cz-desk",      href: "/cocozuri",            label: "CocoZuri",   icon: Candy },
  { id: "cz-products",  href: "/cocozuri/products",   label: "Products",   icon: Package },
  { id: "cz-customers", href: "/cocozuri/customers",  label: "Customers",  icon: Building2 },
  /* ⚠️ The things you COUNT, as against the things you SELL. The only way to
     make one used to be an add-button inside a count sheet, and shelves could
     not be managed at all. */
  { id: "cz-items",     href: "/cocozuri/items",      label: "Stock items", icon: Boxes },
  /* ⚠️ SHELVES HAD NO ADDRESS. They were managed in a sheet inside Stock
     items, which is not somewhere anybody finds a thing — and a shelf is set up
     BEFORE the items that sit on it, so it belongs in the rail ahead of them. */
  { id: "cz-shelves",   href: "/cocozuri/shelves",    label: "Shelves",     icon: Warehouse },
  /* ⚠️ The words you pick from. They were free text, and the catalogue has
     five count units where it has three. */
  { id: "cz-lists",     href: "/cocozuri/lists",      label: "Lists",       icon: ListChecks },
  { id: "cz-invoices",  href: "/cocozuri/invoices",   label: "Invoices",   icon: Receipt },
  /* CocoZuri Operations — Phase 3: money in, what is owed, statements. */
  { id: "cz-receipts",   href: "/cocozuri/receipts",   label: "Money in",   icon: Banknote },
  { id: "cz-owed",       href: "/cocozuri/owed",       label: "Owed",       icon: AlarmClock },
  { id: "cz-statements", href: "/cocozuri/statements", label: "Statements", icon: FileSpreadsheet },
  /* CocoZuri Operations — Phase 4: the daily stock book. */
  { id: "cz-stock",       href: "/cocozuri/stock",       label: "Stock book", icon: Boxes },
  { id: "cz-stock-month", href: "/cocozuri/stock/month", label: "Month end", icon: ClipboardCheck },
  /* Phase 5 — what to make and send, from the shelf's own history. */
  /* ⚠️ WHAT TO MAKE TODAY, not what to buy (owner, 27 Aug 2026). The buying
     half lives at /cocozuri/order/materials and is reached from a plan whose
     materials fall short. */
  { id: "cz-order",       href: "/cocozuri/order",       label: "Order form", icon: OrderIcon },
  { id: "cz-buy-list",    href: "/cocozuri/order/materials", label: "What to buy", icon: ShoppingCart },
  /* Manufacturing Stage 2 — what was bought, and the budget it was bought
     against. See memory/cocozuri_manufacturing_plan.md. */
  { id: "cz-purchases",   href: "/cocozuri/purchases",   label: "Purchases",  icon: ShoppingCart },
  /* ⚠️ The SHARED vendor register, not a second list — it simply lived in
     another module, so from inside CocoZuri nobody could see it. */
  { id: "cz-suppliers",   href: "/cocozuri/suppliers",   label: "Suppliers",  icon: Building2 },
  /* ⚠️ A PRICE IS A ROW WITH A DATE, and until now the only thing any screen
     could do was add one dated today for everybody. No customer's own price
     could be set, no date corrected, no wrong one removed. */
  { id: "cz-prices",      href: "/cocozuri/prices",      label: "Prices",     icon: Tag },
  { id: "cz-budgets",     href: "/cocozuri/budgets",     label: "Budgets",    icon: Wallet },
  /* Manufacturing Stage 3 — what a bar costs to make, before one is made. */
  { id: "cz-recipes",     href: "/cocozuri/recipes",     label: "Recipes",    icon: ChefHat },
  /* Manufacturing Stage 4 — what was planned, what came out, and where the
     difference went. */
  { id: "cz-batches",     href: "/cocozuri/batches",     label: "Production", icon: Factory },
  /* Manufacturing Stage 5 — kitchen to shop, with what actually arrived. */
  { id: "cz-transfers",   href: "/cocozuri/transfers",   label: "Transfers",  icon: Truck },
  /* Manufacturing Stage 6 — what came back, what was repacked, what was thrown. */
  { id: "cz-returns",     href: "/cocozuri/returns",     label: "Returns & damage", icon: Undo2 },
  /* Manufacturing Stage 7 — which chocolate makes money. */
  { id: "cz-profit",      href: "/cocozuri/profit",      label: "Profit",     icon: TrendingUp },
  /* Manufacturing Stage 8 — money out, the twin of money in. */
  { id: "cz-payments",    href: "/cocozuri/payments",    label: "Money out",  icon: Banknote },
  /* Manufacturing Stage 9 — expiry, shelf life and the batch trace. */
  { id: "cz-trace",       href: "/cocozuri/trace",       label: "Trace",      icon: Radar },
  /* ⚠️ What happened, and when — nothing in the module could answer it. */
  { id: "cz-history",     href: "/cocozuri/history",     label: "What happened", icon: HistoryIcon },
  /* Manufacturing Stage 5b — what goes over a counter. ⚠️ A record, not a till. */
  { id: "cz-counter",     href: "/cocozuri/counter",     label: "The counter", icon: Store },
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
      { label: "Work", ids: ["approvals", "notes", "outbox", "chat", "calendar", "brief", "announcements"] },
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
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    blurb: "Social media and photography — what went out, for whom, and what it did.",
    home: "/marketing",
    match: ["/marketing"],
    // ⚠️ Grouped by the order the work happens, not by what sort of screen each
    // one is — the same rule the CocoZuri rail follows. Adding a page? Put it
    // where it happens in the day.
    quick: ["mkt-posts", "mkt-calendar", "mkt-results", "mkt-library"],
    groups: [
      { label: "Start", ids: ["marketing"] },
      { label: "1 Plan", ids: ["mkt-campaigns", "mkt-calendar"] },
      { label: "2 Shoot", ids: ["mkt-shoots", "mkt-library"] },
      { label: "3 Post", ids: ["mkt-posts"] },
      { label: "4 Measure", ids: ["mkt-results"] },
      { label: "5 Set up", ids: ["mkt-accounts", "mkt-clients"] },
    ],
  },
  {
    id: "recruitment",
    label: "Recruitment",
    icon: UserSearch,
    blurb: "Indian professionals for Tanzanian employers — orders, shortlists, placements.",
    home: "/recruitment",
    match: ["/recruitment"],
    quick: ["rec-orders", "rec-candidates", "rec-shortlists", "rec-placements"],
    groups: [
      { label: "Desk", ids: ["recruitment", "rec-orders", "rec-candidates", "rec-clients"] },
      { label: "In progress", ids: ["rec-shortlists", "rec-interviews", "rec-placements"] },
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    icon: ScaleIcon,
    blurb: "The books — chart of accounts, journals, reports and tax.",
    home: "/ledger",
    match: ["/ledger"],
    quick: ["ledger-reports", "ledger-journals", "ledger-entries", "ledger-tax"],
    groups: [
      { label: "Books", ids: ["ledger", "ledger-journals", "ledger-entries"] },
      { label: "Output", ids: ["ledger-reports", "ledger-tax"] },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    icon: DraftingCompass,
    blurb: "Capital projects — budgets, requisitions, funds and site progress.",
    home: "/projects",
    match: ["/projects"],
    groups: [{ label: "Projects", ids: ["projects"] }],
  },
  {
    id: "ops",
    label: "Orders & Imports",
    icon: Ship,
    blurb: "The trading and import business — orders, shipments, billing and what is owed.",
    home: "/ops",
    match: ["/ops"],
    quick: ["ops", "ops-imports", "ops-invoices", "ops-payments"],
    groups: [
      { label: "Sell", ids: ["ops", "ops-funnel"] },
      { label: "Ship", ids: ["ops-imports", "ops-invoices"] },
      { label: "Money", ids: ["ops-payments", "ops-report"] },
      { label: "Lists", ids: ["ops-setup"] },
    ],
  },
  {
    id: "cocozuri",
    label: "CocoZuri Operations",
    icon: Candy,
    blurb: "Chocolate — products, invoices, what is owed, and the daily stock book.",
    home: "/cocozuri",
    match: ["/cocozuri"],
    quick: ["cz-stock", "cz-batches", "cz-invoices", "cz-owed"],
    /* ⚠️ THE RAIL FOLLOWS THE CHOCOLATE, in the order it actually happens: set
       it up, buy the materials, make it, keep it, sell it, get paid, pay out,
       put right what went wrong, then find out whether it was worth doing. The
       owner asked for this (22 Aug 2026) and it is the right default — a
       sidebar grouped by "what sort of screen is this" makes somebody learn a
       map; grouped by the work, it reads like the day.

       ⚠️ Adding a page? Put it where it happens in the day, not at the end. */
    groups: [
      { label: "Start", ids: ["cz-desk"] },
      /* ⚠️ SET UP IS IN THE ORDER YOU FILL IT IN, and that order is a chain of
         real dependencies — nothing here needs anything BELOW it:

           Lists       the words the forms below pick from
           Products    what you sell
           Customers   who you sell it to
           Prices      what you charge — needs a product, and a customer for an
                       agreed price, so it cannot come before either
           Shelves     the places you count; a stock item CANNOT be added
                       without one
           Stock items what you count, on those shelves, linked to those
                       products — so both come first
           Suppliers   who you buy from, which hands over to 2 · Buy

         ⚠️ SUPPLIERS IS SET-UP, NOT BUYING. It was filed under Buy because that
         is where it was built. Shelves and Prices had no home at all — a shelf
         was a sheet inside Stock items, and a price was one box on the product
         form that could only ever add one dated today. */
      { label: "1 · Set up", ids: [
        "cz-lists", "cz-products", "cz-customers", "cz-prices",
        "cz-shelves", "cz-items", "cz-suppliers",
      ] },
      { label: "2 · Buy", ids: ["cz-buy-list", "cz-budgets", "cz-purchases"] },
      { label: "3 · Make", ids: ["cz-order", "cz-recipes", "cz-batches"] },
      { label: "4 · Keep", ids: ["cz-stock", "cz-stock-month", "cz-transfers"] },
      { label: "5 · Sell", ids: ["cz-counter", "cz-invoices"] },
      { label: "6 · Get paid", ids: ["cz-receipts", "cz-owed", "cz-statements"] },
      { label: "7 · Pay out", ids: ["cz-payments"] },
      { label: "8 · Put right", ids: ["cz-returns"] },
      { label: "9 · Know", ids: ["cz-profit", "cz-trace", "cz-history"] },
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
