import Link from "next/link";
import {
  Home, FileText, CheckSquare, NotebookPen, Network, Package, Laptop,
  CalendarDays, Sparkles, Building2, Users, Send, Inbox, BarChart3,
  Settings, NotebookText, type LucideIcon,
} from "lucide-react";

/* ---------------------------------------------------------------------------
 * System map — the single source of truth for "what pages exist". This is the
 * picture of the app: top-level areas (the bottom-nav tabs) and the pages that
 * live under each. Each node links straight to the page, so the map doubles as
 * a full index. Keep this in sync when pages are added or removed.
 * ------------------------------------------------------------------------- */

type MapNode = {
  label: string;
  href?: string;
  desc?: string;
  icon?: LucideIcon;
  children?: MapNode[];
};

export const SYSTEM_MAP: MapNode[] = [
  {
    label: "Home", href: "/", icon: Home,
    desc: "Command centre",
    children: [
      { label: "Overview", href: "/?tab=overview", desc: "Portfolio snapshot" },
      { label: "Companies", href: "/?tab=companies", desc: "Per-company cards" },
      { label: "Tasks", href: "/?tab=tasks", desc: "All tasks table" },
    ],
  },
  {
    label: "Director Brief", href: "/brief", icon: FileText,
    desc: "Glanceable portfolio report · WhatsApp / Email / PDF",
  },
  {
    label: "Task Management", href: "/registry", icon: CheckSquare,
    desc: "Capture & track work",
    children: [
      { label: "New task", href: "/task/new", desc: "Create a tracked task" },
      { label: "Task detail", href: "/registry", desc: "Timeline, updates, history (/task/[code])" },
    ],
  },
  {
    label: "Workbook", href: "/workbook", icon: NotebookPen,
    desc: "Meetings · Notes · To-do",
    children: [
      { label: "Meeting Workspace", href: "/meeting", desc: "Notes → minutes → tasks", icon: NotebookText },
    ],
  },
  {
    label: "HRMS", href: "/hrms", icon: Network,
    desc: "HR & Admin operating system",
    children: [
      { label: "Organogram", href: "/hrms/org", desc: "Reporting structure", icon: Network },
      { label: "OECR", href: "/hrms/oecr", desc: "Office equipment stock", icon: Package },
      { label: "Assets & Vendors", href: "/hrms/assets", desc: "Durable kit + suppliers", icon: Laptop },
      { label: "Leave & Attendance", href: "/hrms/leave", desc: "ELR-Act leave", icon: CalendarDays },
      { label: "OCR", href: "/hrms/ocr", desc: "Cleaning checklist", icon: Sparkles },
      { label: "Companies", href: "/companies", desc: "Company dashboards", icon: Building2 },
      { label: "People", href: "/people", desc: "Person records & profiles", icon: Users },
      { label: "Documents", href: "/documents", desc: "Compliance & files", icon: FileText },
      { label: "Letters", href: "/letters", desc: "Branded PDF letters", icon: FileText },
      { label: "Company Letterheads", href: "/letterheads", desc: "Per-company branding", icon: Building2 },
      { label: "Inbox", href: "/inbox", desc: "Smart intake", icon: Inbox },
      { label: "Outbox", href: "/outbox", desc: "Reminder & message drafts", icon: Send },
      { label: "Insights", href: "/insights", desc: "Analytics", icon: BarChart3 },
      { label: "Settings", href: "/settings", desc: "App configuration", icon: Settings },
    ],
  },
];

function ChildRow({ node }: { node: MapNode }) {
  const Icon = node.icon;
  const inner = (
    <>
      <span className="flex items-center gap-2 min-w-0">
        {Icon && <Icon size={13} className="text-fg-subtle shrink-0" />}
        <span className="text-sm text-fg truncate">{node.label}</span>
      </span>
      {node.desc && <span className="text-[11px] text-fg-subtle truncate hidden sm:block">{node.desc}</span>}
    </>
  );
  return (
    <li>
      {node.href ? (
        <Link
          href={node.href}
          className="flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 rounded-lg hover:bg-bg-muted/60 transition-colors"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-3 py-1.5 px-2">{inner}</div>
      )}
    </li>
  );
}

/** The full system map — top-level areas with their pages beneath. */
export function SystemMap() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {SYSTEM_MAP.map((area) => {
        const Icon = area.icon;
        return (
          <section key={area.label} className="rounded-2xl glass elevated p-4">
            <div className="flex items-start gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
                {Icon && <Icon size={17} />}
              </span>
              <div className="min-w-0">
                {area.href ? (
                  <Link href={area.href} className="font-semibold text-fg hover:text-accent hover:underline">
                    {area.label}
                  </Link>
                ) : (
                  <span className="font-semibold text-fg">{area.label}</span>
                )}
                {area.desc && <div className="text-[11px] text-fg-subtle">{area.desc}</div>}
              </div>
            </div>
            {area.children && area.children.length > 0 && (
              <ul className="mt-3 ml-4 pl-4 border-l border-border/70 space-y-0.5">
                {area.children.map((c) => (
                  <ChildRow key={c.label} node={c} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
