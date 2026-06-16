import Link from "next/link";
import * as Lucide from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Settings } from "lucide-react";
import { CockpitModule } from "@/components/cockpit-module";
import { WORLDS } from "@/lib/worlds";

// The whole system in a few doors. Tapping a world opens its World screen
// (/world/<slug>) — one calm step, then one more to any page inside it. Reads the
// shared registry so home + nav + world screens never drift. Settings is not a
// world but stays here as a utility tile.
const icon = (name: string): LucideIcon =>
  ((Lucide as Record<string, unknown>)[name] as LucideIcon) ?? Lucide.Circle;

const tileClass =
  "group flex flex-col items-center gap-2 rounded-2xl bg-bg-subtle/50 px-2 py-3.5 text-center ring-1 ring-border/40 transition-all hover:-translate-y-0.5 hover:ring-accent/30";

export function CockpitWorlds() {
  return (
    <CockpitModule icon={<LayoutGrid size={13} />} title="Worlds">
      <div className="mt-3 grid grid-cols-4 gap-2.5">
        {WORLDS.map((w) => {
          const Icon = icon(w.icon);
          return (
            <Link key={w.slug} href={`/world/${w.slug}`} className={tileClass}>
              <Icon size={21} style={{ color: w.color }} strokeWidth={1.75} />
              <span className="truncate text-xs font-medium group-hover:text-accent">{w.name}</span>
            </Link>
          );
        })}
        <Link href="/settings" className={tileClass}>
          <Settings size={21} className="text-fg-muted" strokeWidth={1.75} />
          <span className="truncate text-xs font-medium group-hover:text-accent">Settings</span>
        </Link>
      </div>
    </CockpitModule>
  );
}
