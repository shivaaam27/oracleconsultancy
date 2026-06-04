import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type RegistryStat = { label: string; tone?: "default" | "warn" | "danger" | "success" };

/**
 * A module card on the HRMS hub. Each registry (OECR, OCR, …) renders one.
 * Clickable cards navigate into the module; "coming soon" cards are inert.
 */
export function RegistryCard({
  href, abbr, title, description, icon: Icon, stats, comingSoon,
}: {
  href: string;
  abbr: string;
  title: string;
  description: string;
  icon: LucideIcon;
  stats?: RegistryStat[];
  comingSoon?: boolean;
}) {
  const toneCls = {
    default: "bg-bg-muted text-fg-muted",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  };

  const inner = (
    <div
      className={cn(
        "group relative h-full bg-bg-elev border border-border rounded-2xl p-5 elevated transition-all duration-200",
        comingSoon ? "opacity-70" : "hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
          <Icon size={20} />
        </div>
        {comingSoon ? (
          <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-bg-muted text-fg-subtle">
            Coming soon
          </span>
        ) : (
          <ChevronRight size={18} className="text-fg-subtle group-hover:text-fg transition-colors" />
        )}
      </div>

      <div className="mt-4">
        <div className="text-base font-semibold tracking-tight">{abbr}</div>
        <div className="text-xs text-fg-subtle">{title}</div>
      </div>
      <p className="text-xs text-fg-muted mt-2 leading-relaxed">{description}</p>

      {stats && stats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {stats.map((s, i) => (
            <span key={i} className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tabular", toneCls[s.tone ?? "default"])}>
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  if (comingSoon) return inner;
  return <Link href={href} className="block h-full">{inner}</Link>;
}
