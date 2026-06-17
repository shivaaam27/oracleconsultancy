"use client";

import { Mail, MessageCircle, Phone, AlertCircle, MoonStar, UserX, Users, ShieldCheck, ArrowUpRight, Plane, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { displayNote } from "@/lib/notes-display";
import { StaffIdChip } from "./staff-id-chip";
import { EntityCard } from "./entity-card";
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

const PORTAL_ROLE_LABEL: Record<string, string> = { manager: "Manager", director: "Director", hr: "Admin", staff: "Staff" };
// Role tint for the portal pill. Cool-blue for manager (the common case), the
// accent for the higher-trust Director/Admin roles, muted for plain Staff.
const PORTAL_ROLE_PILL: Record<string, string> = {
  director: "bg-accent-soft text-accent",
  hr: "bg-accent-soft text-accent",
  manager: "bg-info-soft text-info",
  staff: "bg-bg-muted text-fg-muted",
};

const TYPE_TINT: Record<string, string> = {
  local_staff: "bg-accent-soft text-accent ring-accent/25",
  outsider: "bg-bg-muted text-fg-muted ring-border",
  expat: "bg-info-soft text-info ring-info/25",
  candidate: "bg-warn-soft text-warn ring-warn/25",
};

// A small SVG ring that fills with colour by compliance score — calmer than a
// flat block, and the % sits beneath it. r=15 → circumference ≈ 94.25.
function ComplianceDial({ score, status }: { score: number; status: "Good" | "Watch" | "Risk" }) {
  const C = 94.25;
  const off = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  const stroke = status === "Risk" ? "var(--color-danger)" : status === "Watch" ? "var(--color-warn)" : "var(--color-success)";
  const text = status === "Risk" ? "text-danger" : status === "Watch" ? "text-warn" : "text-success";
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 w-[42px]" title={`Document compliance: ${score}% (${status})`}>
      <svg width="30" height="30" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-border)" strokeWidth="3" opacity="0.5" />
        <circle cx="18" cy="18" r="15" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 18 18)" />
      </svg>
      <span className={cn("text-[10px] font-semibold tabular leading-none", text)}>{score}%</span>
    </div>
  );
}

/**
 * A single person in the directory — a spacious, self-contained Aurora glass
 * card (no shared slab): a company-tinted left rail, ring avatar with a
 * status dot, role-tinted portal pill, a three-tier text block, and a
 * compliance dial + workload pill on the right. Tap opens the full popup;
 * long-press is handled by the parent (peek). In select mode the card becomes
 * a checkbox target.
 */
export function PersonCard({
  person: p,
  onOpen,
  compliance,
  hint,
  directReports = 0,
  accentColor,
  selectMode = false,
  selected = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: {
  person: PersonRow;
  onOpen: () => void;
  compliance?: { score: number; status: "Good" | "Watch" | "Risk" } | null;
  hint?: { onLeave: boolean; present: number; absent: number } | null;
  /** Count of people who report to this person (primary line) — for the directory. */
  directReports?: number;
  /** Company brand colour for the left rail. */
  accentColor?: string | null;
  selectMode?: boolean;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
}) {
  const snoozed = !!(p.snoozedUntil && p.snoozedUntil > new Date());
  const dim = !p.active || snoozed;
  const wl = p.workload;
  const onLeave = !!hint?.onLeave;

  const workloadTint = wl.overdue > 0
    ? "bg-danger-soft/70 ring-1 ring-danger/30 text-danger"
    : wl.open >= 5 ? "bg-warn-soft/70 ring-1 ring-warn/30 text-warn"
    : wl.open === 0 ? "bg-bg-subtle/60 ring-1 ring-border/60 text-fg-subtle"
    : "bg-info-soft/70 ring-1 ring-info/30 text-info";

  const role = p.portalRole ?? "staff";
  const metaPrimary = p.role || "—";
  const metaCompany = [p.companyName, p.associations.length ? `+${p.associations.length}` : null].filter(Boolean).join(" · ");

  return (
    <EntityCard
      onActivate={onOpen}
      accentColor={accentColor}
      selected={selected}
      dim={dim}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
    >
      {/* Select checkbox (select mode) */}
      {selectMode && (
        <span className={cn("h-5 w-5 rounded-md border flex items-center justify-center shrink-0",
          selected ? "bg-accent border-accent text-accent-fg" : "border-border-strong")}>
          {selected && <Check size={13} strokeWidth={3} />}
        </span>
      )}

      {/* Ring avatar + status dot */}
      <span className="relative shrink-0">
        <span className={cn("h-11 w-11 rounded-full ring-2 flex items-center justify-center text-[14px] font-semibold", TYPE_TINT[p.personType] ?? TYPE_TINT.outsider)}>
          {initials(p.name)}
        </span>
        {onLeave && (
          <span title="On approved leave today" className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-warn ring-2 ring-bg-elev" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-[14.5px] leading-tight truncate group-hover:text-accent transition-colors">{p.name}</span>
          <StaffIdChip id={p.staffId} className="shrink-0" />
          {p.portalEnabled ? (
            <span title={`Portal access · ${PORTAL_ROLE_LABEL[role] ?? "Staff"}`}
              className={cn("inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-px text-[10px] font-medium shrink-0", PORTAL_ROLE_PILL[role] ?? PORTAL_ROLE_PILL.staff)}>
              <ShieldCheck size={11} /> {PORTAL_ROLE_LABEL[role] ?? "Staff"}
            </span>
          ) : (
            <span title="No portal access" className="inline-flex items-center rounded-full px-2 py-px text-[10px] font-medium text-fg-subtle border border-dashed border-border shrink-0">
              No portal
            </span>
          )}
          {!p.active && <UserX size={12} className="text-fg-subtle shrink-0" />}
          {snoozed && <MoonStar size={12} className="text-warn shrink-0" />}
        </div>

        <div className="text-xs text-fg-muted truncate mt-1">
          {metaPrimary}{metaCompany && <span className="text-fg-subtle"> · {metaCompany}</span>}
        </div>

        {onLeave ? (
          <div className="flex items-center gap-1 text-[11px] text-warn mt-0.5"><Plane size={11} /> On leave today</div>
        ) : (p.managerName || directReports > 0 || p.secondaryManagers.length > 0) ? (
          <div className="flex items-center gap-2.5 text-[11px] text-fg-subtle truncate mt-0.5">
            {p.managerName && <span className="inline-flex items-center gap-0.5 truncate"><ArrowUpRight size={11} /> {p.managerName}</span>}
            {p.secondaryManagers.length > 0 && <span className="text-info/80 shrink-0">+{p.secondaryManagers.length}</span>}
            {directReports > 0 && <span className="inline-flex items-center gap-0.5 shrink-0"><Users size={11} /> {directReports}</span>}
          </div>
        ) : displayNote(p.notes) ? (
          <div className="text-[11px] text-fg-subtle truncate mt-0.5">{displayNote(p.notes)}</div>
        ) : null}
      </div>

      {/* Contact channels (actionable) — hidden on mobile to keep the card calm;
          the full drawer (one tap) carries every channel. */}
      <div className="hidden sm:flex items-center gap-2 text-fg-subtle shrink-0" onClick={(e) => e.stopPropagation()}>
        {p.email && <a href={`mailto:${p.email}`} title={p.email} className="hover:text-accent transition-colors"><Mail size={14} /></a>}
        {p.whatsapp && <a href={whatsappHref(p.whatsapp)} target="_blank" rel="noreferrer" title={p.whatsapp} className="hover:text-accent transition-colors"><MessageCircle size={14} /></a>}
        {p.phone && <a href={`tel:${p.phone}`} title={p.phone} className="hover:text-accent transition-colors"><Phone size={14} /></a>}
        {!p.hasContact && <span title="No contact info" className="text-danger"><AlertCircle size={14} /></span>}
      </div>

      {hint && hint.absent > 0 && !onLeave && (
        <span title={`${hint.absent} absence(s) recorded this month`} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tabular shrink-0 ring-1 bg-danger-soft/60 ring-danger/25 text-danger">
          {hint.absent} abs
        </span>
      )}

      {compliance && <ComplianceDial score={compliance.score} status={compliance.status} />}

      <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium tabular shrink-0", workloadTint)}>
        {wl.open}{wl.overdue ? ` · ${wl.overdue}↓` : ""}
      </span>
    </EntityCard>
  );
}
