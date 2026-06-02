"use client";

import { useEffect, useState } from "react";
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

/** Weather-tinted glow colour for the ambient aurora. */
function glowFor(kind: WeatherKind | null): string {
  switch (kind) {
    case "sun": return "hsl(38 95% 55% / 0.30)";
    case "rain":
    case "storm": return "hsl(212 90% 55% / 0.30)";
    case "snow": return "hsl(190 80% 62% / 0.26)";
    case "cloud":
    case "fog": return "hsl(220 16% 60% / 0.24)";
    default: return "hsl(var(--accent) / 0.26)";
  }
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
    <motion.span className="text-accent inline-flex shrink-0" {...anim}>
      <Icon size={22} strokeWidth={1.9} />
    </motion.span>
  );
}

export function WelcomeHero({
  pulse,
  city = "Dar es Salaam",
  lat = -6.7924,
  lon = 39.2083,
}: {
  pulse: string;
  city?: string;
  lat?: number;
  lon?: number;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
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
  const date = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const hello = now ? greeting(now.getHours()) : "Welcome back";

  const glow1 = glowFor(weather?.kind ?? null);
  const glow2 = "hsl(var(--accent) / 0.22)";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 30 }}
      className="glass elevated relative overflow-hidden rounded-3xl p-4 sm:p-5"
    >
      {/* Living aurora — two slow-drifting, weather-tinted glows breathe across the whole card */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${glow1}, transparent 70%)` }}
        animate={{ x: [0, 22, 0], y: [0, 14, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full blur-3xl opacity-70"
        style={{ background: `radial-gradient(circle, ${glow2}, transparent 70%)` }}
        animate={{ x: [0, -18, 0], y: [0, -12, 0], scale: [1, 1.16, 1] }}
        transition={{ duration: 21, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex items-start justify-between gap-3">
        {/* Greeting */}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight leading-tight">{hello}</h1>
          <p className="text-xs text-fg-muted mt-0.5">{date}</p>
        </div>

        {/* Time + weather — floating directly on the card, no box */}
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-0.5 tabular leading-none">
            <span className="text-2xl font-semibold">{hh}</span>
            <span className="text-2xl font-semibold text-fg-muted animate-pulse">:</span>
            <span className="text-2xl font-semibold">{mm}</span>
          </div>
          {weather && (
            <div className="mt-1.5 flex items-center justify-end gap-1.5">
              <AnimatedWeatherIcon kind={weather.kind} Icon={weather.Icon} />
              <span className="text-sm font-semibold tabular">{weather.temp}°C</span>
              <span className="text-[11px] text-fg-muted">{weather.label}</span>
            </div>
          )}
          <div className="mt-1 text-[10px] text-fg-muted inline-flex items-center gap-1 justify-end">
            <MapPin size={10} /> {city}
          </div>
        </div>
      </div>

      {/* Pulse — one human insight */}
      {pulse && (
        <p className="relative mt-3.5 inline-flex items-start gap-1.5 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0 animate-pulse" />
          <span className="text-fg-muted leading-snug">{pulse}</span>
        </p>
      )}
    </motion.section>
  );
}
