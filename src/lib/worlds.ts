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
    blurb: "Staff directory, profiles, org structure and leave.",
    icon: "Users",
    color: "#7F77DD",
    pages: [
      { label: "Directory",      href: "/people",                icon: "Users" },
      { label: "Organogram",     href: "/hrms/org",              icon: "Network" },
      { label: "Leave & Attendance", href: "/hrms/leave",        icon: "CalendarDays" },
      { label: "Data-collection form", href: "/people/form",     icon: "ClipboardList" },
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
      { label: "Organogram",     href: "/hrms/org",              icon: "Network" },
      { label: "Insights",       href: "/insights",              icon: "BarChart3" },
    ],
  },
  {
    slug: "work",
    name: "Work",
    blurb: "Tasks, meetings, notes and to-dos.",
    icon: "ClipboardCheck",
    color: "#1D9E75",
    pages: [
      { label: "Task Management", href: "/?tab=tasks",           icon: "ClipboardCheck" },
      { label: "Workbook",        href: "/workbook",             icon: "NotebookPen" },
      { label: "Calendar",        href: "/calendar",             icon: "CalendarClock" },
      { label: "Requests",        href: "/requests",             icon: "MessageSquareText" },
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
      { label: "Applications in progress", href: "/hrms/pipeline", icon: "ClipboardList" },
      { label: "Commitments register", href: "/hrms/registers",  icon: "FileWarning" },
      { label: "Inbox",           href: "/inbox",                icon: "Inbox" },
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
    name: "Money & board",
    blurb: "Director brief, board pack and the financial picture.",
    icon: "PieChart",
    color: "#D4537E",
    pages: [
      { label: "Director Brief",  href: "/brief",                icon: "ClipboardList" },
      { label: "Board pack",      href: "/brief/board",          icon: "PieChart" },
      { label: "Insights",        href: "/insights",             icon: "BarChart3" },
    ],
  },
  {
    slug: "comms",
    name: "Comms",
    blurb: "Chat, outbox drafts, letters and announcements.",
    icon: "MessageSquare",
    color: "#1D9E75",
    pages: [
      { label: "Chat",            href: "/chat",                 icon: "MessageSquare" },
      { label: "Outbox",          href: "/outbox",               icon: "Send" },
      { label: "Letters",         href: "/letters",              icon: "FileText" },
      { label: "Announcements",   href: "/announcements",        icon: "Megaphone" },
    ],
  },
];

export function getWorld(slug: string): World | undefined {
  return WORLDS.find((w) => w.slug === slug);
}
