"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, FileWarning,
  PackageCheck, Plus, ShieldCheck, Building2, Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { LinkButton } from "@/components/ui";
import { EntityDrawer } from "@/components/entity-drawer";
import type { ComplianceScore } from "@/lib/compliance";

/* ------------------------------------------------------------------ */
/* Tone + small visual helpers                                         */
/* ------------------------------------------------------------------ */
function tone(score: ComplianceScore) {
  if (score.status === "Risk") return {
    icon: AlertTriangle, text: "text-danger", bg: "bg-danger-soft/60", ring: "ring-danger/25",
    bar: "bg-danger", glow: "danger" as const,
  };
  if (score.status === "Watch") return {
    icon: FileWarning, text: "text-warn", bg: "bg-warn-soft/60", ring: "ring-warn/25",
    bar: "bg-warn", glow: "warn" as const,
  };
  return {
    icon: CheckCircle2, text: "text-success", bg: "bg-success-soft/60", ring: "ring-success/25",
    bar: "bg-success", glow: "success" as const,
  };
}

function bandClass(value: number) {
  if (value < 60) return "text-danger";
  if (value < 90) return "text-warn";
  return "text-success";
}

/** A thin SVG donut that animates to `value`%. Inherits colour via currentColor. */
function Ring({
  value, size = 76, stroke = 7, className, children,
}: { value: number; size?: number; stroke?: number; className?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0", className)}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border/40" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {children && <span className="absolute inset-0 flex flex-col items-center justify-center">{children}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Deep-link helpers (unchanged behaviour)                             */
/* ------------------------------------------------------------------ */
function ownerHref(score: ComplianceScore) {
  return score.ownerType === "company" ? `/documents?company=${score.ownerId}` : `/people?person=${score.ownerId}`;
}

function categoryForRequirement(label: string) {
  const l = label.toLowerCase();
  if (l.includes("passport")) return "Passport";
  if (l.includes("permit") || l.includes("visa") || l.includes("immigration")) return "Immigration";
  if (l.includes("contract") || l.includes("engagement")) return "Contract";
  if (l.includes("tax") || l.includes("tin")) return "Tax";
  if (l.includes("licence") || l.includes("license")) return "Licence";
  if (l.includes("registration")) return "Registration";
  return undefined;
}

function addDocumentHref(score: ComplianceScore, gap: ComplianceScore["gaps"][number]) {
  const params = new URLSearchParams({ newdoc: "1", title: gap.label });
  if (score.ownerType === "company") params.set("company", String(score.ownerId));
  else params.set("person", String(score.ownerId));
  // Carry the requirement's own category so the saved document auto-links straight
  // back to this gap. Fall back to a keyword guess only when the gap has none.
  const category = gap.categories?.[0] ?? categoryForRequirement(gap.label);
  if (category) params.set("category", category);
  return `/documents?${params.toString()}`;
}

function personPackHref(score: ComplianceScore) {
  const params = new URLSearchParams({ person: String(score.ownerId), pack: "1" });
  return `/people?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Owner row — name, mini bar, gap preview, score                      */
/* ------------------------------------------------------------------ */
function ScoreRow({ score, onOpen }: { score: ComplianceScore; onOpen: (score: ComplianceScore) => void }) {
  const t = tone(score);
  const Icon = t.icon;
  const preview =
    score.gaps[0] ? `Missing: ${score.gaps.slice(0, 2).map((g) => g.label).join(", ")}`
    : score.documentIssues[0] ? `Issue: ${score.documentIssues.slice(0, 2).map((d) => d.title).join(", ")}`
    : "All required documents present.";

  return (
    <button
      type="button"
      onClick={() => onOpen(score)}
      className="group block w-full rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-bg-muted/45"
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1", t.bg, t.ring)}>
          <Icon size={17} className={t.text} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium transition-colors group-hover:text-accent">{score.ownerName}</span>
            <span className={cn("ml-auto text-sm font-semibold tabular", t.text)}>{score.score}%</span>
          </span>
          {/* mini progress bar */}
          <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-border/40">
            <span className={cn("block h-full rounded-full transition-[width] duration-700 ease-out", t.bar)} style={{ width: `${score.score}%` }} />
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {score.missing > 0 && <Stat n={score.missing} label="missing" cls="text-danger" />}
            {score.expired > 0 && <Stat n={score.expired} label="expired" cls="text-danger" />}
            {score.expiring > 0 && <Stat n={score.expiring} label="expiring" cls="text-warn" />}
            {score.missing === 0 && score.expired === 0 && score.expiring === 0 && (
              <span className="text-success">Up to date</span>
            )}
          </span>
          <span className="mt-1 block truncate text-[11px] text-fg-subtle">{preview}</span>
        </span>
      </div>
    </button>
  );
}

function Stat({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-bg-muted/70 px-1.5 py-0.5 font-medium", cls)}>
      <span className="tabular">{n}</span> {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Scope list — all owners, worst-first, healthy ones collapsible      */
/* ------------------------------------------------------------------ */
function ScopeList({ scores, emptyLabel, onOpen }: {
  scores: ComplianceScore[];
  emptyLabel: string;
  onOpen: (s: ComplianceScore) => void;
}) {
  const [showClear, setShowClear] = useState(false);
  const sorted = useMemo(
    () => scores.slice().sort((a, b) => a.score - b.score || b.expired - a.expired || b.missing - a.missing),
    [scores],
  );
  const attention = sorted.filter((s) => s.status !== "Good");
  const clear = sorted.filter((s) => s.status === "Good");

  if (scores.length === 0) {
    return (
      <div className="rounded-2xl bg-bg-subtle/60 px-4 py-8 text-center text-sm text-fg-muted ring-1 ring-border/50">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {attention.length > 0 ? (
        <div className="divide-y divide-border/40 rounded-2xl ring-1 ring-border/40 overflow-hidden">
          {attention.map((s) => <ScoreRow key={`${s.ownerType}-${s.ownerId}`} score={s} onOpen={onOpen} />)}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-success-soft/40 px-4 py-6 text-sm font-medium text-success ring-1 ring-success/20">
          <CheckCircle2 size={16} /> Everyone here is up to date.
        </div>
      )}

      {clear.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowClear((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted/45"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-soft/70 text-success ring-1 ring-success/20">
              <CheckCircle2 size={12} />
            </span>
            {clear.length} all clear
            <ChevronDown size={14} className={cn("ml-auto transition-transform", showClear && "rotate-180")} />
          </button>
          {showClear && (
            <div className="divide-y divide-border/40 rounded-2xl ring-1 ring-border/40 overflow-hidden animate-in fade-in-0 slide-in-from-top-1 duration-200">
              {clear.map((s) => <ScoreRow key={`${s.ownerType}-${s.ownerId}`} score={s} onOpen={onOpen} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail content (inside the EntityDrawer body)                       */
/* ------------------------------------------------------------------ */
function ScoreDetailBody({ score }: { score: ComplianceScore }) {
  const gaps = score.gaps;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-bg-subtle/60 p-3 ring-1 ring-border/50">
        <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Why this score</div>
        <p className="mt-1 text-sm text-fg-muted">
          {score.required > 0
            ? `${score.present} of ${score.required} required item${score.required === 1 ? "" : "s"} are present.`
            : `${score.monitoredDocuments} linked document${score.monitoredDocuments === 1 ? "" : "s"} monitored for expiry.`}
          {" "}
          {score.status === "Risk" ? "This needs attention." : score.status === "Watch" ? "This is worth watching." : "No action is needed right now."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Missing documents</div>
          {gaps.length > 0 ? (
            <div className="divide-y divide-border/50 overflow-hidden rounded-2xl ring-1 ring-border/50">
              {gaps.map((gap) => (
                <div key={gap.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="text-danger">Missing</span>
                    <span className="text-fg-muted"> · {gap.label}</span>
                  </span>
                  <Link
                    href={addDocumentHref(score, gap)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent/10 px-2 py-1 text-xs text-accent transition-colors hover:bg-accent/20"
                  >
                    <Plus size={12} /> Add
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-bg-subtle/60 px-3 py-4 text-sm text-fg-muted ring-1 ring-border/50">
              No required documents are missing.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Expiry issues</div>
          {score.documentIssues.length > 0 ? (
            <div className="divide-y divide-border/50 overflow-hidden rounded-2xl ring-1 ring-border/50">
              {score.documentIssues.map((doc) => (
                <div key={doc.id} className="px-3 py-2 text-sm">
                  <div className={cn("font-medium", doc.status === "Expired" ? "text-danger" : "text-warn")}>{doc.status}</div>
                  <div className="text-fg-muted">{doc.title}</div>
                  <div className="text-[11px] text-fg-subtle">{[doc.category, doc.expiryLabel].filter(Boolean).join(" · ")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-bg-subtle/60 px-3 py-4 text-sm text-fg-muted ring-1 ring-border/50">
              No linked documents are expired or expiring.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header stat tile                                                    */
/* ------------------------------------------------------------------ */
function HeroTile({ value, label, cls }: { value: number; label: string; cls?: string }) {
  return (
    <div className="rounded-2xl bg-bg-subtle/70 px-3 py-2.5 ring-1 ring-border/50 backdrop-blur-sm">
      <div className={cn("text-xl font-semibold tabular", value > 0 ? cls : "text-fg")}>{value}</div>
      <div className="text-[11px] text-fg-muted">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main panel                                                          */
/* ------------------------------------------------------------------ */
export function ComplianceScorePanel({
  companyScores,
  personScores,
}: {
  companyScores: ComplianceScore[];
  personScores: ComplianceScore[];
}) {
  const [selected, setSelected] = useState<ComplianceScore | null>(null);
  const [scope, setScope] = useState<"company" | "person">("company");

  const all = useMemo(() => [...companyScores, ...personScores], [companyScores, personScores]);
  const portfolioScore = companyScores.length
    ? Math.round(companyScores.reduce((sum, s) => sum + s.score, 0) / companyScores.length)
    : 100;
  const missing = all.reduce((sum, s) => sum + s.missing, 0);
  const expired = all.reduce((sum, s) => sum + s.expired, 0);
  const expiring = all.reduce((sum, s) => sum + s.expiring, 0);
  const allClear = all.filter((s) => s.status === "Good").length;

  const companyAttention = companyScores.filter((s) => s.status !== "Good").length;
  const peopleAttention = personScores.filter((s) => s.status !== "Good").length;

  const detailTone = selected ? tone(selected).glow : "accent";

  return (
    <>
      {/* Hero — portfolio ring + headline stats */}
      <section className="glass elevated relative overflow-hidden rounded-3xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 left-10 h-44 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: `radial-gradient(circle, hsl(var(--accent)), transparent 70%)` }}
        />
        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-center gap-4">
            <Ring value={portfolioScore} className={bandClass(portfolioScore)}>
              <span className="text-lg font-semibold tabular leading-none">{portfolioScore}%</span>
              <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-fg-subtle">Portfolio</span>
            </Ring>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck size={16} className="text-accent" /> Compliance score
              </div>
              <p className="mt-1 max-w-xs text-xs text-fg-muted">
                Company checklists plus per-person document requirements; others are monitored when documents exist.
              </p>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            <HeroTile value={missing} label="Missing" cls="text-danger" />
            <HeroTile value={expired} label="Expired" cls="text-danger" />
            <HeroTile value={expiring} label="Expiring" cls="text-warn" />
            <HeroTile value={allClear} label="All clear" cls="text-success" />
          </div>
        </div>

        {/* Scope toggle */}
        <div className="relative px-4 pb-2">
          <div className="inline-flex items-center gap-1 rounded-full glass elevated p-1">
            {([
              { id: "company" as const, label: "Companies", icon: <Building2 size={14} />, n: companyAttention },
              { id: "person" as const, label: "People", icon: <Users size={14} />, n: peopleAttention },
            ]).map((s) => {
              const active = scope === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScope(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-all",
                    active ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:bg-bg-muted/60 hover:text-fg",
                  )}
                >
                  {s.icon}
                  {s.label}
                  {s.n > 0 && (
                    <span className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular",
                      active ? "bg-accent-fg/20 text-accent-fg" : "bg-danger-soft text-danger")}>
                      {s.n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active scope list */}
        <div className="relative px-3 pb-3 sm:px-4 sm:pb-4">
          <div key={scope} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            {scope === "company" ? (
              <ScopeList scores={companyScores} emptyLabel="No companies to score yet." onOpen={setSelected} />
            ) : (
              <ScopeList scores={personScores} emptyLabel="No active people to score yet." onOpen={setSelected} />
            )}
          </div>
        </div>
      </section>

      {/* Detail drawer — same shell as the company/person pop-ups */}
      <EntityDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.ownerName ?? "Compliance detail"}
        tone={detailTone}
        hero={selected && (
          <div className="flex items-center gap-4 pr-8">
            <Ring value={selected.score} size={64} stroke={6} className={bandClass(selected.score)}>
              <span className="text-base font-semibold tabular">{selected.score}%</span>
            </Ring>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{selected.ownerName}</div>
              <div className="mt-0.5 text-xs text-fg-muted">
                {selected.ownerType === "company" ? "Company compliance" : "Person compliance"} · {selected.status}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                {selected.missing > 0 && <Stat n={selected.missing} label="missing" cls="text-danger" />}
                {selected.expired > 0 && <Stat n={selected.expired} label="expired" cls="text-danger" />}
                {selected.expiring > 0 && <Stat n={selected.expiring} label="expiring" cls="text-warn" />}
                {selected.missing === 0 && selected.expired === 0 && selected.expiring === 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft/70 px-2 py-0.5 font-medium text-success">
                    <CheckCircle2 size={12} /> Up to date
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        tabs={selected ? [{ id: "detail", label: "Detail", content: <ScoreDetailBody score={selected} /> }] : []}
        activeTab="detail"
        onTabChange={() => {}}
        actionBar={selected && (
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={ownerHref(selected)}
              size="sm"
            >
              <ExternalLink size={13} /> {selected.ownerType === "company" ? "Filter documents" : "Open person"}
            </LinkButton>
            {selected.ownerType === "person" && (
              <Link
                href={personPackHref(selected)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-elev px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-border hover:bg-bg-muted"
              >
                <PackageCheck size={13} /> Prepare pack
              </Link>
            )}
          </div>
        )}
      />
    </>
  );
}
