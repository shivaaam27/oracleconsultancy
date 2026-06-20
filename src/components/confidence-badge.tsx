import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

/**
 * How sure the AI read of a document was. A small, glanceable badge so the owner
 * can see at a glance which auto-filings to trust and which to double-check —
 * part of the "unsure, please check" lane. null = manual entry (no badge).
 */
export function confidenceTier(c: number | null | undefined): "verified" | "high" | "low" | null {
  if (c == null) return null;
  if (c >= 1) return "verified"; // human-confirmed
  if (c >= 0.6) return "high";
  return "low";
}

const META = {
  verified: { Icon: ShieldCheck, label: "Confirmed", cls: "text-success ring-success/30 bg-success/10" },
  high: { Icon: ShieldCheck, label: "High confidence", cls: "text-accent ring-accent/30 bg-accent/10" },
  low: { Icon: ShieldAlert, label: "Please check", cls: "text-warn ring-warn/40 bg-warn/10" },
} as const;

export function ConfidenceBadge({ confidence, showLabel = true, className = "" }: { confidence: number | null | undefined; showLabel?: boolean; className?: string }) {
  const tier = confidenceTier(confidence);
  if (!tier) return null;
  const { Icon, label, cls } = META[tier];
  const pct = confidence != null && confidence < 1 ? ` ${Math.round(confidence * 100)}%` : "";
  return (
    <span
      title={`AI read confidence${confidence != null ? `: ${Math.round(confidence * 100)}%` : ""}`}
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${cls} ${className}`}
    >
      <Icon size={11} />
      {showLabel && <span>{label}{pct}</span>}
    </span>
  );
}

export { ShieldQuestion };
