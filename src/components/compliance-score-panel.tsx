import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileWarning, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ComplianceScore } from "@/lib/compliance";

function tone(score: ComplianceScore) {
  if (score.status === "Risk") return {
    icon: AlertTriangle,
    text: "text-danger",
    bg: "bg-danger-soft/60",
    ring: "ring-danger/25",
  };
  if (score.status === "Watch") return {
    icon: FileWarning,
    text: "text-warn",
    bg: "bg-warn-soft/60",
    ring: "ring-warn/25",
  };
  return {
    icon: CheckCircle2,
    text: "text-success",
    bg: "bg-success-soft/60",
    ring: "ring-success/25",
  };
}

function ScoreCard({ score }: { score: ComplianceScore }) {
  const t = tone(score);
  const Icon = t.icon;
  const href = score.ownerType === "company" ? `/documents?company=${score.ownerId}` : `/people?person=${score.ownerId}`;

  return (
    <Link
      href={href}
      className="group rounded-2xl bg-bg-elev ring-1 ring-border p-3 elevated hover:-translate-y-0.5 hover:ring-accent/25 transition-all"
    >
      <div className="flex items-start gap-3">
        <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1", t.bg, t.ring)}>
          <Icon size={17} className={t.text} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium group-hover:text-accent transition-colors">{score.ownerName}</span>
            <span className={cn("ml-auto text-sm font-semibold tabular", t.text)}>{score.score}%</span>
          </span>
          <span className="mt-1 block text-xs text-fg-muted">
            {score.missing} missing - {score.expired} expired - {score.expiring} expiring
          </span>
          {score.gaps[0] && (
            <span className="mt-1 block truncate text-[11px] text-fg-subtle">
              Missing: {score.gaps.slice(0, 2).map((gap) => gap.label).join(", ")}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}

export function ComplianceScorePanel({
  companyScores,
  personScores,
}: {
  companyScores: ComplianceScore[];
  personScores: ComplianceScore[];
}) {
  const riskyCompanies = companyScores.filter((score) => score.status !== "Good");
  const riskyPeople = personScores.filter((score) => score.status !== "Good");
  const portfolioScore = companyScores.length
    ? Math.round(companyScores.reduce((sum, score) => sum + score.score, 0) / companyScores.length)
    : 100;
  const missing = [...companyScores, ...personScores].reduce((sum, score) => sum + score.missing, 0);

  return (
    <section className="glass elevated rounded-2xl overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={16} className="text-accent" /> Compliance score
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            Company checklist plus expat document requirements; other people are monitored when documents exist.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-xl bg-bg-subtle px-3 py-2 text-xs ring-1 ring-border/60">
            <span className="block text-lg font-semibold tabular">{portfolioScore}%</span>
            Portfolio
          </span>
          <span className="rounded-xl bg-bg-subtle px-3 py-2 text-xs ring-1 ring-border/60">
            <span className="block text-lg font-semibold tabular">{missing}</span>
            Missing
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Company gaps</div>
          {riskyCompanies.length > 0 ? (
            riskyCompanies.slice(0, 4).map((score) => <ScoreCard key={`c-${score.ownerId}`} score={score} />)
          ) : (
            <div className="rounded-2xl bg-bg-subtle/60 px-4 py-6 text-center text-sm text-fg-muted">
              No company checklist gaps.
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">People gaps</div>
          {riskyPeople.length > 0 ? (
            riskyPeople.slice(0, 4).map((score) => <ScoreCard key={`p-${score.ownerId}`} score={score} />)
          ) : (
            <div className="rounded-2xl bg-bg-subtle/60 px-4 py-6 text-center text-sm text-fg-muted">
              No people checklist gaps.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
