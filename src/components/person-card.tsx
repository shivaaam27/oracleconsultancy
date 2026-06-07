"use client";

import { Mail, MessageCircle, Phone, AlertCircle, MoonStar, UserX } from "lucide-react";
import { cn } from "@/lib/cn";
import { displayNote } from "@/lib/notes-display";
import type { PersonRow } from "@/lib/people-queries";

function whatsappHref(num: string) {
  return `https://wa.me/${num.replace(/[^0-9]/g, "")}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TYPE_TINT: Record<string, string> = {
  local_staff: "bg-accent-soft text-accent ring-accent/25",
  outsider: "bg-bg-muted text-fg-muted ring-border",
  expat: "bg-info-soft text-info ring-info/25",
  candidate: "bg-warn-soft text-warn ring-warn/25",
};

/**
 * Square person card for the directory grid. Tap opens the full popup;
 * long-press is handled by the parent (peek preview). No hover overlay — just a
 * subtle lift — so cards never overlap their neighbours.
 */
export function PersonCard({
  person: p,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: {
  person: PersonRow;
  onOpen: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
}) {
  const snoozed = !!(p.snoozedUntil && p.snoozedUntil > new Date());
  const dim = !p.active || snoozed;
  const wl = p.workload;

  const workloadTint = wl.overdue > 0
    ? "bg-danger-soft/70 ring-1 ring-danger/30 text-danger"
    : wl.open >= 5 ? "bg-warn-soft/70 ring-1 ring-warn/30 text-warn"
    : wl.open === 0 ? "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-subtle"
    : "bg-info-soft/70 ring-1 ring-info/30 text-info";

  const metaLine = [p.role, p.companyName, p.associations.length ? `+${p.associations.length}` : null].filter(Boolean).join(" · ") || "—";

  return (
    <div
      onClick={onOpen}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "group flex items-center gap-3 px-3.5 py-2.5 cursor-pointer select-none hover:bg-bg-muted/40 transition-colors",
        dim && "opacity-60"
      )}
    >
      <span className={cn("h-9 w-9 rounded-full ring-1 flex items-center justify-center text-[13px] font-semibold shrink-0", TYPE_TINT[p.personType] ?? TYPE_TINT.outsider)}>
        {initials(p.name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm leading-tight truncate group-hover:text-accent transition-colors">{p.name}</span>
          {!p.active && <UserX size={12} className="text-fg-subtle shrink-0" />}
          {snoozed && <MoonStar size={12} className="text-warn shrink-0" />}
        </div>
        <div className="text-xs text-fg-muted truncate mt-0.5">{metaLine}</div>
        {displayNote(p.notes) && (
          <div className="text-xs text-fg-subtle truncate mt-0.5">{displayNote(p.notes)}</div>
        )}
      </div>

      {/* Contact channels (actionable) */}
      <div className="flex items-center gap-2 text-fg-subtle shrink-0" onClick={(e) => e.stopPropagation()}>
        {p.email && <a href={`mailto:${p.email}`} title={p.email} className="hover:text-accent transition-colors"><Mail size={14} /></a>}
        {p.whatsapp && <a href={whatsappHref(p.whatsapp)} target="_blank" rel="noreferrer" title={p.whatsapp} className="hover:text-accent transition-colors"><MessageCircle size={14} /></a>}
        {p.phone && <a href={`tel:${p.phone}`} title={p.phone} className="hover:text-accent transition-colors"><Phone size={14} /></a>}
        {!p.hasContact && <span title="No contact info" className="text-danger"><AlertCircle size={14} /></span>}
      </div>

      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tabular shrink-0", workloadTint)}>
        {wl.open}{wl.overdue ? ` · ${wl.overdue}↓` : ""}
      </span>
    </div>
  );
}
