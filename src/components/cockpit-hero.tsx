"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { getGivenName } from "@/lib/names";
import { TONE, type Tone } from "@/components/surface-kit";
import { CockpitLive } from "@/components/cockpit-live";

export type HeroKpi = { label: string; value: number; tone?: Tone; href: string; suffix?: string };
export type HeroPill = { label: string; href: string; tone: Tone };

/* count-up, reduced-motion safe (finishes instantly) */
function useCountUp(target: number, duration = 1000) {
  const [v, setV] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) {
      setV(target);
      ref.current = target;
      return;
    }
    const from = ref.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      setV(next);
      ref.current = next;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function Ring({ percent, tone }: { percent: number; tone: Tone }) {
  const v = useCountUp(percent, 1100);
  const size = 128;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (v / 100) * c;
  const color = TONE[tone].stroke;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.5} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.2s linear", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={cn("text-3xl font-semibold tabular leading-none", TONE[tone].text)}>{v}%</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-fg-subtle">health</div>
      </div>
    </div>
  );
}

function Kpi({ k }: { k: HeroKpi }) {
  const v = useCountUp(k.value);
  return (
    <Link href={k.href} className="group block text-left">
      <div className={cn("text-[26px] font-semibold tabular leading-none transition-colors", k.tone ? TONE[k.tone].text : "text-fg", "group-hover:text-accent")}>
        {v}
        {k.suffix ?? ""}
      </div>
      <div className="mt-1.5 text-xs text-fg-muted">{k.label}</div>
    </Link>
  );
}

export function CockpitHero({
  greeting,
  name,
  health,
  healthTone,
  healthSub,
  oriLine,
  kpis,
  pills,
}: {
  greeting: string;
  name?: string;
  health: number;
  healthTone: Tone;
  healthSub: string;
  oriLine: string;
  kpis: HeroKpi[];
  pills: HeroPill[];
}) {
  const given = name ? getGivenName(name) : "";
  return (
    <div className="rounded-3xl bg-bg-subtle/50 p-6 text-center ring-1 ring-border/50 sm:p-8">
      <CockpitLive />
      <h1 className="mt-3 text-2xl font-semibold sm:text-[26px]">{given ? `${greeting}, ${given}` : greeting}</h1>
      <p className="mx-auto mt-2 flex max-w-md items-start justify-center gap-1.5 text-sm leading-relaxed text-accent">
        <Sparkles size={15} className="mt-0.5 shrink-0" />
        <span>{oriLine}</span>
      </p>

      <div className="mt-6 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-10">
        <div className="flex flex-col items-center">
          <Ring percent={health} tone={healthTone} />
          <span className="mt-2 text-[11px] text-fg-muted">{healthSub}</span>
        </div>
        <div className="flex items-start gap-6 sm:gap-7">
          {kpis.map((k, i) => (
            <div key={k.label} className={cn(i > 0 && "border-l border-border/50 pl-6 sm:pl-7")}>
              <Kpi k={k} />
            </div>
          ))}
        </div>
      </div>

      {pills.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {pills.map((p) => (
            <Link
              key={p.label}
              href={p.href}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition-all hover:-translate-y-0.5",
                TONE[p.tone].bg,
                TONE[p.tone].text,
                TONE[p.tone].ring,
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
