"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, CloudLightning, MapPin, type LucideIcon,
} from "lucide-react";

type WeatherKind = "sun" | "cloud" | "rain" | "snow" | "storm" | "fog";
type Weather = { temp: number; label: string; Icon: LucideIcon; kind: WeatherKind };

function wmo(code: number): { label: string; Icon: LucideIcon; kind: WeatherKind } {
  if (code === 0) return { label: "Clear", Icon: Sun, kind: "sun" };
  if (code <= 2) return { label: "Partly cloudy", Icon: CloudSun, kind: "sun" };
  if (code === 3) return { label: "Overcast", Icon: Cloud, kind: "cloud" };
  if (code === 45 || code === 48) return { label: "Fog", Icon: CloudFog, kind: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", Icon: CloudDrizzle, kind: "rain" };
  if (code >= 61 && code <= 67) return { label: "Rain", Icon: CloudRain, kind: "rain" };
  if (code >= 71 && code <= 77) return { label: "Snow", Icon: CloudSnow, kind: "snow" };
  if (code >= 80 && code <= 82) return { label: "Showers", Icon: CloudRain, kind: "rain" };
  if (code >= 95) return { label: "Thunderstorm", Icon: CloudLightning, kind: "storm" };
  return { label: "—", Icon: Cloud, kind: "cloud" };
}

function greeting(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

/** Gentle, design-aligned motion per weather type (reduced-motion safe via MotionConfig). */
function AnimatedWeatherIcon({ kind, Icon }: { kind: WeatherKind; Icon: LucideIcon }) {
  const anim =
    kind === "sun"
      ? { animate: { rotate: 360 }, transition: { duration: 22, repeat: Infinity, ease: "linear" as const } }
      : kind === "cloud" || kind === "fog"
        ? { animate: { x: [0, 2.5, 0, -2.5, 0] }, transition: { duration: 6, repeat: Infinity, ease: "easeInOut" as const } }
        : kind === "rain" || kind === "storm"
          ? { animate: { y: [0, 1.5, 0] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" as const } }
          : { animate: { y: [0, -1.5, 0] }, transition: { duration: 4, repeat: Infinity, ease: "easeInOut" as const } };
  return (
    <motion.span className="text-accent inline-flex" {...anim}>
      <Icon size={26} strokeWidth={1.9} />
    </motion.span>
  );
}

type Stat = { label: string; value: number; href: string; tone?: "neutral" | "warn" | "danger" };

export function WelcomeHero({
  pulse,
  city = "Dar es Salaam",
  lat = -6.7924,
  lon = 39.2083,
  stats = [],
}: {
  pulse: string;
  city?: string;
  lat?: number;
  lon?: number;
  stats?: Stat[];
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.current) return;
        const { label, Icon, kind } = wmo(Number(d.current.weather_code));
        setWeather({ temp: Math.round(d.current.temperature_2m), label, Icon, kind });
      })
      .catch(() => { /* weather is decorative — fail quietly */ });
    return () => { cancelled = true; };
  }, [lat, lon]);

  const hh = now ? String(now.getHours()).padStart(2, "0") : "--";
  const mm = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  const ss = now ? String(now.getSeconds()).padStart(2, "0") : "--";
  const date = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const hello = now ? greeting(now.getHours()) : "Welcome back";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 30 }}
      className="glass elevated relative overflow-hidden rounded-3xl p-4 sm:p-5"
    >
      {/* soft accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full blur-3xl opacity-50"
        style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.30), transparent 70%)" }}
      />

      <div className="relative flex items-start justify-between gap-3">
        {/* Greeting + pulse */}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight leading-tight">{hello}</h1>
          <p className="text-xs text-fg-muted mt-0.5">{date}</p>
          {pulse && (
            <p className="mt-3 inline-flex items-start gap-1.5 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0 animate-pulse" />
              <span className="text-fg-muted leading-snug">{pulse}</span>
            </p>
          )}
        </div>

        {/* Time + weather mini-card */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="shrink-0 rounded-2xl bg-bg-subtle/60 ring-1 ring-border/70 backdrop-blur-md px-3.5 py-3 text-right select-none"
        >
          {/* Clock — seconds tick subtly */}
          <div className="flex items-baseline justify-end gap-0.5 tabular leading-none">
            <span className="text-2xl font-semibold">{hh}</span>
            <span className="text-2xl font-semibold text-fg-muted animate-pulse">:</span>
            <span className="text-2xl font-semibold">{mm}</span>
            <span className="text-xs font-medium text-fg-subtle ml-1 w-6 text-left">{ss}</span>
          </div>
          <div className="mt-1 text-[10px] text-fg-muted inline-flex items-center gap-1 justify-end">
            <MapPin size={10} /> {city}
          </div>

          {/* Weather */}
          {weather && (
            <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-end gap-2">
              <AnimatedWeatherIcon kind={weather.kind} Icon={weather.Icon} />
              <div className="leading-tight text-right">
                <div className="text-base font-semibold tabular">{weather.temp}°C</div>
                <div className="text-[10px] text-fg-muted">{weather.label}</div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Key counts — colour-tinted glass chips with count-in-circle */}
      {stats.length > 0 && (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {stats.map((s) => {
            const dim = s.value === 0;
            const tint = dim
              ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle"
              : s.tone === "danger" ? "bg-danger-soft/60 ring-1 ring-danger/30 text-danger"
              : s.tone === "warn" ? "bg-warn-soft/60 ring-1 ring-warn/30 text-warn"
              : "bg-info-soft/60 ring-1 ring-info/30 text-info";
            return (
              <Link
                key={s.label}
                href={s.href}
                className={`inline-flex items-center gap-2 pl-2 pr-3 py-1.5 text-xs rounded-full transition-all backdrop-blur-md hover:shadow-sm ${dim ? "" : "hover:ring-2"} ${tint}`}
              >
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/30 dark:bg-black/20 font-semibold tabular">
                  {s.value}
                </span>
                <span className="font-medium">{s.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}
