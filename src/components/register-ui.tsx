"use client";

import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

/** Compact icon-only toolbar button (used for secondary register actions). */
export function IconAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-fg-muted ring-1 ring-border bg-bg-subtle/60 backdrop-blur-md hover:text-fg hover:bg-bg-muted transition-colors shrink-0"
    >
      {children}
    </button>
  );
}

/** A styled row inside a kebab DropdownMenu. */
export function MenuItem({
  icon,
  children,
  onSelect,
  danger = false,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={(e) => { e.preventDefault(); onSelect(); }}
      className={cn(
        "px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted",
        danger && "text-danger data-[highlighted]:bg-danger-soft"
      )}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}
