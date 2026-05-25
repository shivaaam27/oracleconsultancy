"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  ListChecks,
  Building2,
  Users,
  Send,
  History,
  Settings,
  Plus,
  Sparkles,
  AlertOctagon,
  FileText,
  NotebookPen,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/registry", label: "Registry", icon: ListChecks },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/meeting", label: "Meeting Mode", icon: NotebookPen },
  { href: "/escalations", label: "Escalations", icon: AlertOctagon },
  { href: "/digest", label: "Weekly Digest", icon: FileText },
  { href: "/people", label: "People", icon: Users },
  { href: "/outbox", label: "Outbox", icon: Send },
  { href: "/audit", label: "Audit Log", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <aside className="w-60 shrink-0 bg-bg-subtle border-r border-border flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shadow-sm">
          <Sparkles size={15} className="text-accent-fg" />
        </div>
        <div>
          <div className="font-semibold tracking-tight">COS</div>
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle -mt-0.5">Oracle Group</div>
        </div>
      </div>

      <div className="px-3 mt-2">
        <Link
          href="/task/new"
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity shadow-sm"
        >
          <Plus size={14} /> New Task
        </Link>
      </div>

      <nav className="flex-1 px-3 mt-4 space-y-0.5">
        {nav.map((n) => {
          const active = isActive(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent-soft text-accent font-medium"
                  : "text-fg-muted hover:text-fg hover:bg-bg-muted"
              )}
            >
              <Icon size={15} strokeWidth={active ? 2.25 : 2} />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 text-[10px] text-fg-subtle border-t border-border">
        v0.10 · Phase 10
      </div>
    </aside>
  );
}
