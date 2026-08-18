"use client";

// The two sections of Orders & Imports. Real links, not state — a record is a
// page with its own URL (CLAUDE.md), so a section can be bookmarked.

import Link from "next/link";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "orders", label: "Orders", href: "/ops" },
  // Last on purpose: the lists are set up once and then rarely touched.
  { key: "setup", label: "Setup", href: "/ops/setup" },
] as const;

export function OpsTabs({ active, company }: { active: string; company?: number }) {
  const q = company ? `?company=${company}` : "";
  return (
    <nav className="flex items-center gap-1 border-b border-border" aria-label="Sections">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href + q}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-1.5 text-[13px] transition-colors",
            active === t.key
              ? "border-accent font-medium text-fg"
              : "border-transparent text-fg-muted hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
