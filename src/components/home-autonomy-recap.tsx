import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { CockpitItem } from "@/lib/cockpit-shared";

/**
 * A slim "what ORI did for you" strip for the home — makes the system's autonomy
 * (auto-filed / renamed / verified / advanced) visible and trusted at a glance,
 * without a heavy panel. Reuses listCockpitActivity (automation_events +
 * profile_suggestions); the full, undoable feed lives on /inbox. Renders nothing
 * when the system has been quiet, so it never adds noise on a clear day.
 */
export function HomeAutonomyRecap({ items }: { items: CockpitItem[] }) {
  if (!items || items.length === 0) return null;
  const top = items.slice(0, 3);

  return (
    <Link
      href="/inbox"
      className="group flex items-center gap-3 rounded-2xl bg-bg-elev/60 ring-1 ring-border px-3.5 py-2.5 transition hover:ring-accent/40"
    >
      <div className="grid h-8 w-8 place-items-center rounded-xl bg-accent/10 text-accent shrink-0">
        <Sparkles size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-fg">
          ORI handled {items.length} thing{items.length === 1 ? "" : "s"} for you
        </div>
        <div className="text-[11px] text-fg-subtle truncate">
          {top.map((t) => t.summary).join(" · ")}
        </div>
      </div>
      <span className="text-[11px] text-fg-subtle flex items-center gap-1 shrink-0 group-hover:text-accent transition">
        Review <ArrowRight size={12} />
      </span>
    </Link>
  );
}
