// src/lib/worlds.ts
// Single source of truth for the 7 Worlds. Pure data — icon = lucide name string
// so this is import-light and usable from server components, the nav pill and ⌘K.

export type WorldSlug =
  | "people" | "companies" | "work" | "compliance" | "assets" | "money" | "comms";

export type WorldPage = { label: string; href: string; icon: string }; // icon = lucide name
export type World = {
  slug: WorldSlug;
  name: string;
  blurb: string;
  icon: string;   // lucide name for the world itself
  color: string;  // accent hex
  pages: WorldPage[];
};

export const WORLDS: World[] = [
  {
    slug: "people",
    name: "People",
    blurb: "Staff directory, profiles and attendance.",
    icon: "Users",
    color: "#7F77DD",
    pages: [
      { label: "Directory",      href: "/people",                icon: "Users" },
      { label: "Attendance",     href: "/hrms/leave",            icon: "CalendarDays" },
    ],
  },
  {
    slug: "companies",
    name: "Companies",
    blurb: "The seven portfolio companies and reference data.",
    icon: "Building2",
    color: "#378ADD",
    pages: [
      { label: "Companies hub",  href: "/companies",             icon: "Building2" },
      { label: "Insights",       href: "/insights",              icon: "BarChart3" },
    ],
  },
  {
    slug: "work",
    name: "Work",
    blurb: "Tasks, brief and automation.",
    icon: "ClipboardCheck",
    color: "#1D9E75",
    pages: [
      { label: "Task Management", href: "/?tab=tasks",           icon: "ClipboardCheck" },
      { label: "Brief",           href: "/calendar",             icon: "CalendarClock" },
      { label: "ORI Automation",  href: "/ori-automations",      icon: "Zap" },
    ],
  },
  {
    slug: "compliance",
    name: "Compliance",
    blurb: "Documents, checklists, tax, legal and registers.",
    icon: "ShieldCheck",
    color: "#BA7517",
    pages: [
      { label: "Documents",       href: "/documents",            icon: "FileText" },
      { label: "Tax & Legal",     href: "/hrms/command-centre",  icon: "Scale" },
      { label: "Commitments register", href: "/hrms/registers",  icon: "FileWarning" },
    ],
  },
  {
    slug: "assets",
    name: "Assets",
    blurb: "Durable equipment, tools, stock and vendors.",
    icon: "Package",
    color: "#D85A30",
    pages: [
      { label: "Assets, Tools & Vendors", href: "/hrms/assets",  icon: "Laptop" },
      { label: "OECR (stock)",    href: "/hrms/oecr",            icon: "Package" },
      { label: "OCR (cleaning)",  href: "/hrms/ocr",             icon: "Sparkles" },
    ],
  },
  {
    slug: "money",
    name: "Board",
    blurb: "Director brief and the portfolio picture.",
    icon: "PieChart",
    color: "#D4537E",
    pages: [
      { label: "Director Brief",  href: "/brief",                icon: "ClipboardList" },
      { label: "Insights",        href: "/insights",             icon: "BarChart3" },
    ],
  },
  {
    slug: "comms",
    name: "Comms",
    blurb: "Chat, outbox drafts and announcements.",
    icon: "MessageSquare",
    color: "#1D9E75",
    pages: [
      { label: "Chat",            href: "/chat",                 icon: "MessageSquare" },
      { label: "Outbox",          href: "/outbox",               icon: "Send" },
      { label: "Announcements",   href: "/announcements",        icon: "Megaphone" },
    ],
  },
];

export function getWorld(slug: string): World | undefined {
  return WORLDS.find((w) => w.slug === slug);
}

/** Which world a pathname belongs to — for the context-aware nav pill. Matches the
 *  /world/<slug> route first, then the most specific page href inside any world.
 *  (Some pages live in two worlds; the longest-match tiebreak just picks one.) */
export function worldForPath(pathname: string): World | undefined {
  const m = pathname.match(/^\/world\/([^/?]+)/);
  if (m) return getWorld(m[1]);
  let best: World | undefined;
  let bestLen = 0;
  for (const w of WORLDS) {
    for (const p of w.pages) {
      const base = p.href.split("?")[0];
      if (base === "/") continue;
      if ((pathname === base || pathname.startsWith(base + "/")) && base.length > bestLen) {
        best = w;
        bestLen = base.length;
      }
    }
  }
  return best;
}
