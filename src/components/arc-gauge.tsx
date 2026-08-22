"use client";

import { useEffect, useRef, useState } from "react";

/* Shared design-system atom: a 180° arc gauge with a count-up sweep and a
 * soft glow, matching the Portfolio Health gauge on Home. Promoted here so
 * every widget across the system uses the same component. */

export function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) {
      setValue(target);
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
      setValue(next);
      ref.current = next;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** A number that counts up to its value on mount/change. Reduced-motion safe
 *  (snaps instantly via useCountUp). For use from server components. */
export function CountUp({ value, duration = 1000, className }: { value: number; duration?: number; className?: string }) {
  const v = useCountUp(value, duration);
  return <span className={className}>{v}</span>;
}

export function ArcGauge({
  percent,
  color,
  size = 132,
  stroke = 12,
  label,
  sublabel,
}: {
  percent: number;
  color: string; // CSS color, e.g. "hsl(var(--success))"
  size?: number;
  stroke?: number;
  label?: string; // big centre text (defaults to "NN%")
  sublabel?: string;
}) {
  const animated = useCountUp(percent, 1100);
  const r = (size - stroke) / 2;
  const cy = size / 2;
  const d = `M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`;
  const len = Math.PI * r;
  const offset = len - (animated / 100) * len;
  return (
    <div className="relative shrink-0" style={{ width: size, height: cy + stroke / 2 + 6 }}>
      <svg width={size} height={cy + stroke / 2} className="overflow-visible">
        <path d={d} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.5} strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.2s linear", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-x-0 text-center" style={{ top: cy * 0.42 }}>
        <div className="text-2xl font-semibold leading-none tabular">{label ?? `${animated}%`}</div>
        {sublabel && <div className="mt-0.5 text-xs uppercase tracking-wide text-fg-muted">{sublabel}</div>}
      </div>
    </div>
  );
}
