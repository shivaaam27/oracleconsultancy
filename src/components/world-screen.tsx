// src/components/world-screen.tsx
// Presentational World screen. No client hooks — it only renders, so it works as a
// server component. Lucide icons are resolved from string names (so worlds.ts can
// stay import-light and server-safe). Reuses the shared design language: CommandWall
// (centred 880px column), Hero, CockpitModule, Reveal and the TONE record — never
// hardcoded status colours (only the world's own accent hex).
import Link from "next/link";
import * as Lucide from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Activity, ArrowRight, Bell, ChevronRight, LayoutGrid } from "lucide-react";
import { CockpitModule } from "@/components/cockpit-module";
import { Hero, TONE, type Tone } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { CommandWall } from "@/components/command-wall";
import type { World } from "@/lib/worlds";
import type { WorldData } from "@/lib/world-data";

/** Resolve a lucide icon by name, falling back to a neutral Circle. */
function icon(name: string): LucideIcon {
  return ((Lucide as Record<string, unknown>)[name] as LucideIcon) ?? Lucide.Circle;
}

/** Compact number formatter — big money values become "1.2M TZS", everything else
 *  is grouped with British thousands separators plus an optional suffix. */
function fmt(n: number, suffix?: string): string {
  if (suffix === " TZS" && Math.abs(n) >= 1000) {
    return (
      new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n) +
      " TZS"
    );
  }
  return n.toLocaleString("en-GB") + (suffix ?? "");
}

export function WorldScreen({ world, data }: { world: World; data: WorldData }) {
  const WIcon = icon(world.icon);
  const tone = (t?: string): Tone => (t as Tone) ?? "accent";

  return (
    <CommandWall>
      <div className="flex flex-col gap-5">
        {/* Breadcrumb: Worlds › {name} */}
        <Reveal>
          <nav className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Link href="/" className="transition-colors hover:text-fg">
              Worlds
            </Link>
            <ChevronRight size={13} />
            <span className="font-medium text-fg">{world.name}</span>
          </nav>
        </Reveal>

        {/* Hero — world icon + name + blurb, with a stat strip as the body */}
        <Reveal delay={0.04}>
          <Hero
            title={
              <span className="flex items-center gap-3">
                <WIcon size={28} strokeWidth={1.75} style={{ color: world.color }} />
                {world.name}
              </span>
            }
            subtitle={world.blurb}
          >
            {data.stats.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {data.stats.map((s) => {
                  const t = TONE[tone(s.tone)];
                  const body = (
                    <div className={`rounded-2xl px-3 py-3 ring-1 ${t.bg} ${t.ring}`}>
                      <div className={`text-xl font-semibold tabular ${t.text}`}>
                        {fmt(s.value, s.suffix)}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-fg-muted">{s.label}</div>
                    </div>
                  );
                  return s.href ? (
                    <Link
                      key={s.label}
                      href={s.href}
                      className="transition-transform hover:-translate-y-0.5"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div key={s.label}>{body}</div>
                  );
                })}
              </div>
            )}
          </Hero>
        </Reveal>

        {/* Inside {name} — one click to any page in this world */}
        <Reveal delay={0.08}>
          <CockpitModule icon={<LayoutGrid size={13} />} title={`Inside ${world.name}`}>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {world.pages.map((p) => {
                const PIcon = icon(p.icon);
                return (
                  <Link
                    key={p.href + p.label}
                    href={p.href}
                    className="group flex items-center gap-2.5 rounded-2xl bg-bg-subtle/50 px-3 py-3 ring-1 ring-border/40 transition-all hover:-translate-y-0.5 hover:ring-accent/30"
                  >
                    <PIcon
                      size={18}
                      strokeWidth={1.75}
                      className="shrink-0"
                      style={{ color: world.color }}
                    />
                    <span className="truncate text-sm font-medium group-hover:text-accent">
                      {p.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CockpitModule>
        </Reveal>

        {/* Needs you — verb-led action rows, highest severity first */}
        {data.needsYou.length > 0 && (
          <Reveal delay={0.12}>
            <CockpitModule icon={<Bell size={13} />} title="Needs you">
              <div className="mt-3 flex flex-col gap-1.5">
                {data.needsYou.map((n, i) => {
                  const t = TONE[tone(n.tone)];
                  return (
                    <Link
                      key={`${n.href}-${i}`}
                      href={n.href}
                      className="group flex items-center gap-3 rounded-2xl bg-bg-subtle/40 px-3 py-2.5 ring-1 ring-border/40 transition-all hover:ring-accent/30"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.bar}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{n.title}</span>
                        {n.meta && (
                          <span className="block truncate text-[11px] text-fg-muted">{n.meta}</span>
                        )}
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-fg-muted transition-colors group-hover:text-accent"
                      />
                    </Link>
                  );
                })}
              </div>
            </CockpitModule>
          </Reveal>
        )}

        {/* Optional live list (e.g. watch list / on-leave names) */}
        {data.live && data.live.items.length > 0 && (
          <Reveal delay={0.16}>
            <CockpitModule icon={<Activity size={13} />} title={data.live.title}>
              <div className="mt-3 flex flex-col gap-1">
                {data.live.items.map((it, i) => {
                  const row = (
                    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-bg-subtle/50">
                      <span className="truncate text-sm">{it.label}</span>
                      {it.sub && (
                        <span className="shrink-0 text-[11px] tabular text-fg-muted">{it.sub}</span>
                      )}
                    </div>
                  );
                  return it.href ? (
                    <Link key={`${it.label}-${i}`} href={it.href}>
                      {row}
                    </Link>
                  ) : (
                    <div key={`${it.label}-${i}`}>{row}</div>
                  );
                })}
              </div>
            </CockpitModule>
          </Reveal>
        )}
      </div>
    </CommandWall>
  );
}
