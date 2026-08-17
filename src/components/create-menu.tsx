"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Building2, CalendarPlus, CheckSquare, ChevronDown, FileText, FileWarning,
  KanbanSquare, Laptop, Megaphone, Plus, Store, UserPlus, type LucideIcon,
} from "lucide-react";
import { creatables } from "@/lib/entity-view";
import { useRegisteredActions } from "./context-actions";
import { cn } from "@/lib/cn";

/**
 * The global New menu — ERPNext's `+ New`.
 *
 * Before this, Create could only ever raise the thing the page you were on was
 * about: "Add document" on Documents, "New task" everywhere else. Now the split
 * button keeps that guess as the default click — it is nearly always what you
 * want — and the caret beside it opens the full list, so a task can be raised
 * from the Assets page and a vendor from a task.
 *
 * The list is METADATA, from `creatables()`. Adding a record type to
 * `entity-view.ts` puts it in this menu; there is no array here to keep in sync.
 * Icons are the one thing that cannot live in metadata (a component can't be
 * plain data), so they are mapped by id here — the same shape as entity-cells
 * mapping format → renderer.
 */

const ICONS: Record<string, LucideIcon> = {
  task: CheckSquare,
  event: CalendarPlus,
  person: UserPlus,
  document: FileText,
  company: Building2,
  vendor: Store,
  asset: Laptop,
  commitment: FileWarning,
  pipeline: KanbanSquare,
  announcement: Megaphone,
};

export function CreateMenu({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { actions } = useRegisteredActions();
  const items = creatables();

  // Use the page's own create action when it HAS one — "Add asset" on Assets,
  // "New Task" on a company. A page's primary action is not always a create,
  // though: the task record's is "Draft email", which behind a + button read as
  // "create a draft email". So match on intent, and fall back to New task so the
  // button is never missing and never lies.
  const pageCreate = actions.find((a) => /\b(new|create|add|raise)\b/i.test(a.label));
  const primary: { label: string; href?: string; onClick?: () => void } =
    pageCreate ?? { label: "New task", href: "/task/new" };

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const skin = "inline-flex items-center gap-2 bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-accent-fg transition-opacity hover:opacity-90";

  return (
    <div ref={wrap} className="relative">
      {collapsed ? (
        // No room for a split control at 56px — and with the label hidden the
        // default action would be a mystery anyway. One button, whole menu.
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Create"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(skin, "w-full justify-center rounded-lg px-0")}
        >
          <Plus size={14} className="shrink-0" />
        </button>
      ) : (
        <div className="flex">
          {primary.href ? (
            <Link href={primary.href} className={cn(skin, "min-w-0 flex-1 rounded-l-lg")}>
              <Plus size={14} className="shrink-0" />
              <span className="truncate">{primary.label}</span>
            </Link>
          ) : (
            <button type="button" onClick={primary.onClick} className={cn(skin, "min-w-0 flex-1 rounded-l-lg")}>
              <Plus size={14} className="shrink-0" />
              <span className="truncate">{primary.label}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title="Create something else"
            aria-label="Create something else"
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(skin, "rounded-r-lg border-l border-accent-fg/20 px-1.5")}
          >
            <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        </div>
      )}

      {open && (
        <div
          role="menu"
          className="glass-menu absolute left-0 z-50 mt-1 min-w-[186px] rounded-md p-1"
        >
          <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
            Create
          </p>
          {items.map((c) => {
            const Icon = ICONS[c.id] ?? Plus;
            return (
              <Link
                key={c.id}
                href={c.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] text-fg hover:bg-bg-subtle"
              >
                <Icon size={14} className="shrink-0 text-fg-subtle" />
                <span className="truncate">{c.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
