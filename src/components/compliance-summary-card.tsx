import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileWarning, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { ProgressTrack, type KitTone } from "./drawer-kit";
import type { ComplianceScore } from "@/lib/compliance";

function tone(score: ComplianceScore): { icon: typeof AlertTriangle; text: string; bg: string; ring: string; track: KitTone } {
  if (score.status === "Risk") return { icon: AlertTriangle, text: "text-danger", bg: "bg-danger-soft/60", ring: "ring-danger/25", track: "danger" };
  if (score.status === "Watch") return { icon: FileWarning, text: "text-warn", bg: "bg-warn-soft/60", ring: "ring-warn/25", track: "warn" };
  return { icon: CheckCircle2, text: "text-success", bg: "bg-success-soft/60", ring: "ring-success/25", track: "success" };
}

export function ComplianceSummaryCard({ score, compact = false }: { score: ComplianceScore; compact?: boolean }) {
  const t = tone(score);
  const Icon = t.icon;
  const href = score.ownerType === "company" ? `/documents?company=${score.ownerId}` : `/people?person=${score.ownerId}`;
  const next = score.gaps[0]?.label ?? score.documentIssues[0]?.title ?? null;

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-2xl bg-bg-elev ring-1 ring-border elevated hover:ring-accent/25 transition-colors",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("inline-flex shrink-0 items-center justify-center rounded-xl ring-1", compact ? "h-9 w-9" : "h-10 w-10", t.bg, t.ring)}>
          <Icon size={compact ? 17 : 18} className={t.text} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck size={14} className="text-accent" /> Compliance
            </span>
            <span className={cn("ml-auto text-lg font-semibold tabular", t.text)}>{score.score}%</span>
          </span>
          <span className="mt-1.5 block"><ProgressTrack value={score.score} total={100} tone={t.track} /></span>
          <span className="mt-1.5 block text-xs text-fg-muted">
            {score.missing} missing · {score.expired} expired · {score.expiring} expiring
          </span>
          {next && (
            <span className="mt-1 block truncate text-[11px] text-fg-subtle">
              Next: {next}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
