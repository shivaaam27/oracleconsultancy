"use client";

import { Mail, MessageCircle, Phone, AlertCircle, MoonStar, UserX, Users } from "lucide-react";
import { Badge } from "./ui";
import { PersonDrawerLink } from "./person-drawer-link";
import { cn } from "@/lib/cn";
import type { PersonRow } from "@/lib/people-queries";

function whatsappHref(num: string) {
  return `https://wa.me/${num.replace(/[^0-9]/g, "")}`;
}

/**
 * Mobile-first person card — compiles a directory row into one block. Tap opens
 * the profile drawer; long-press is handled by the parent (peek). Mirrors the
 * task-card design language: identity left, workload chip right, contact footer.
 */
export function PersonCard({
  person: p,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: {
  person: PersonRow;
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
    ? "bg-danger-soft/60 ring-1 ring-danger/30 text-danger"
    : wl.open >= 5 ? "bg-warn-soft/60 ring-1 ring-warn/30 text-warn"
    : wl.open === 0 ? "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-subtle"
    : "bg-info-soft/60 ring-1 ring-info/30 text-info";

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("glass elevated rounded-2xl p-3.5 select-none transition-transform active:scale-[0.99]", dim && "opacity-70")}
    >
      {/* Header: name + flags left, workload chip right */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PersonDrawerLink id={p.id} name={p.name} className="text-[15px] font-medium hover:text-accent transition-colors" />
            {p.personType !== "internal" && (
              <Badge tone={p.personType === "expat" ? "info" : "default"}>
                {p.personType === "expat" ? "Expat" : "External"}
              </Badge>
            )}
            {!p.active && <span title="Inactive" className="text-fg-subtle"><UserX size={12} /></span>}
            {snoozed && <span title="Snoozed" className="text-warn"><MoonStar size={12} /></span>}
          </div>
          <div className="text-xs text-fg-muted mt-0.5 truncate">
            {p.companyName ?? "—"}
            {p.associations.length > 0 && <span className="text-fg-subtle"> +{p.associations.length}</span>}
            {p.role && <span className="text-fg-subtle"> · {p.role}</span>}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium tabular shrink-0 backdrop-blur-md ${workloadTint}`}>
          {wl.open} open{wl.overdue ? ` · ${wl.overdue}↓` : ""}
        </span>
      </div>

      {/* Footer: preferred channel + contact icons */}
      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/60">
        {p.preferredChannel && <Badge tone="info">{p.preferredChannel}</Badge>}
        <div className="flex items-center gap-2.5 ml-auto" onClick={(e) => e.stopPropagation()}>
          {p.email && (
            <a href={`mailto:${p.email}`} title={p.email} className="text-fg-subtle hover:text-accent transition-colors"><Mail size={15} /></a>
          )}
          {p.whatsapp && (
            <a href={whatsappHref(p.whatsapp)} target="_blank" rel="noreferrer" title={p.whatsapp} className="text-fg-subtle hover:text-accent transition-colors"><MessageCircle size={15} /></a>
          )}
          {p.phone && (
            <a href={`tel:${p.phone}`} title={p.phone} className="text-fg-subtle hover:text-accent transition-colors"><Phone size={15} /></a>
          )}
          {!p.hasContact && (
            <span title="No contact info on file" className="inline-flex items-center gap-1 text-danger text-[11px]"><AlertCircle size={13} /> No contact</span>
          )}
          {p.hasContact && !p.email && !p.whatsapp && !p.phone && (
            <span className="inline-flex items-center gap-1 text-fg-subtle text-[11px]"><Users size={12} /> —</span>
          )}
        </div>
      </div>
    </div>
  );
}
