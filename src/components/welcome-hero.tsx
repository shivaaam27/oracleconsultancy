"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, CloudLightning, MapPin, type LucideIcon,
} from "lucide-react";

type Weather = { temp: number; label: string; Icon: LucideIcon };

function wmo(code: number): { label: string; Icon: LucideIcon } {
  if (code === 0) return { label: "Clear", Icon: Sun };
  if (code <= 2) return { label: "Partly cloudy", Icon: CloudSun };
  if (code === 3) return { label: "Overcast", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Fog", Icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: "Drizzle", Icon: CloudDrizzle };
  if (code >= 61 && code <= 67) return { label: "Rain", Icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: "Snow", Icon: CloudSnow };
  if (code >= 80 && code <= 82) return { label: "Showers", Icon: CloudRain };
  if (code >= 95) return { label: "Thunderstorm", Icon: CloudLightning };
  return { label: "—", Icon: Cloud };
}

function greeting(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
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
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.current) return;
        const { label, Icon } = wmo(Number(d.current.weather_code));
        setWeather({ temp: Math.round(d.current.temperature_2m), label, Icon });
      })
      .catch(() => { /* weather is decorative — fail quietly */ });
    return () => { cancelled = true; };
  }, [lat, lon]);

  const time = now
    ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
  const date = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const hello = now ? greeting(now.getHours()) : "Welcome back";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="relative overflow-hidden rounded-2xl border border-border p-5 sm:p-6
                 bg-gradient-to-br from-accent/10 via-bg-elev to-bg-elev"
    >
      {/* soft glow */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">{hello}</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-fg-muted">{date}</p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Clock */}
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-semibold tabular leading-none">{time}</div>
            <div className="mt-1 text-[11px] text-fg-muted inline-flex items-center gap-1 justify-end">
              <MapPin size={11} /> {city}
            </div>
          </div>

          {/* Weather */}
          {weather && (
            <div className="flex items-center gap-2 pl-4 border-l border-border">
              <weather.Icon size={28} className="text-accent" />
              <div className="leading-tight">
                <div className="text-xl font-semibold tabular">{weather.temp}°C</div>
                <div className="text-[11px] text-fg-muted">{weather.label}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* COS pulse */}
      {pulse && (
        <p className="relative mt-4 text-sm text-fg-muted">
          <span className="text-accent font-medium">COS pulse · </span>{pulse}
        </p>
      )}
    </motion.section>
  );
}
