"use client";

import { Mail, MessageCircle, Phone, AlertCircle, MoonStar, UserX } from "lucide-react";
import { cn } from "@/lib/cn";
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
  internal: "bg-accent-soft text-accent ring-accent/25",
  external: "bg-bg-muted text-fg-muted ring-border",
  expat: "bg-info-soft text-info ring-info/25",
};

/**
 * Square person card for the directory grid. Front shows identity + contact;
 * hovering lifts the card and reveals a footer with companies + workload — no
 * layout shift (the panel is an absolute overlay).
 */
export function PersonCard({ person: p, onOpen }: { person: PersonRow; onOpen: () => void }) {
  const snoozed = !!(p.snoozedUntil && p.snoozedUntil > new Date());
  const dim = !p.active || snoozed;
  const wl = p.workload;

  const workloadTint = wl.overdue > 0
    ? "bg-danger-soft/70 ring-1 ring-danger/30 text-danger"
    : wl.open >= 5 ? "bg-warn-soft/70 ring-1 ring-warn/30 text-warn"
    : wl.open === 0 ? "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-subtle"
    : "bg-info-soft/70 ring-1 ring-info/30 text-info";

  const companyLine = [p.companyName, p.associations.length ? `+${p.associations.length}` : null].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative overflow-hidden glass elevated rounded-2xl p-4 text-left w-full transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]",
        dim && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("h-10 w-10 rounded-full ring-1 flex items-center justify-center text-sm font-semibold shrink-0", TYPE_TINT[p.personType] ?? TYPE_TINT.external)}>
          {initials(p.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm leading-tight truncate group-hover:text-accent transition-colors">{p.name}</span>
            {!p.active && <UserX size={12} className="text-fg-subtle shrink-0" />}
            {snoozed && <MoonStar size={12} className="text-warn shrink-0" />}
          </div>
          <div className="text-xs text-fg-muted truncate mt-0.5">{p.role || companyLine || "—"}</div>
        </div>
      </div>

      {/* Contact + workload (always visible) */}
      <div className="flex items-center justify-between mt-3.5">
        <div className="flex items-center gap-2.5 text-fg-subtle" onClick={(e) => e.stopPropagation()}>
          {p.email && <a href={`mailto:${p.email}`} title={p.email} className="hover:text-accent transition-colors"><Mail size={14} /></a>}
          {p.whatsapp && <a href={whatsappHref(p.whatsapp)} target="_blank" rel="noreferrer" title={p.whatsapp} className="hover:text-accent transition-colors"><MessageCircle size={14} /></a>}
          {p.phone && <a href={`tel:${p.phone}`} title={p.phone} className="hover:text-accent transition-colors"><Phone size={14} /></a>}
          {!p.hasContact && <span title="No contact info" className="text-danger"><AlertCircle size={14} /></span>}
        </div>
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tabular backdrop-blur-md", workloadTint)}>
          {wl.open}{wl.overdue ? ` · ${wl.overdue}↓` : ""}
        </span>
      </div>

      {/* Hover footer — companies + workload breakdown (absolute, no reflow) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-200 ease-out bg-bg-elev/95 backdrop-blur-md border-t border-border px-4 py-2.5 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-fg-subtle truncate">{companyLine || "No company"}</div>
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="px-1.5 py-0.5 rounded-full bg-bg-subtle text-fg-muted">{wl.open} open</span>
          {wl.overdue > 0 && <span className="px-1.5 py-0.5 rounded-full bg-danger-soft/70 text-danger">{wl.overdue} overdue</span>}
          {wl.dueSoon > 0 && <span className="px-1.5 py-0.5 rounded-full bg-warn-soft/70 text-warn">{wl.dueSoon} soon</span>}
          {wl.blocked > 0 && <span className="px-1.5 py-0.5 rounded-full bg-bg-subtle text-fg-muted">{wl.blocked} blocked</span>}
        </div>
      </div>
    </button>
  );
}
