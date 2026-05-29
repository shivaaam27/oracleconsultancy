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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 30 }}
      className="rounded-xl border border-border bg-bg-elev px-4 py-3"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight leading-tight">{hello}</h1>
          <p className="text-xs text-fg-muted">{date}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Clock */}
          <div className="text-right">
            <div className="text-lg font-semibold tabular leading-none">{time}</div>
            <div className="mt-0.5 text-[10px] text-fg-muted inline-flex items-center gap-1 justify-end">
              <MapPin size={10} /> {city}
            </div>
          </div>

          {/* Weather */}
          {weather && (
            <div className="flex items-center gap-1.5 pl-3 border-l border-border">
              <weather.Icon size={20} className="text-accent" />
              <div className="leading-tight">
                <div className="text-sm font-semibold tabular">{weather.temp}°C</div>
                <div className="text-[10px] text-fg-muted">{weather.label}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* COS pulse */}
      {pulse && (
        <p className="mt-2 pt-2 border-t border-border/60 text-xs text-fg-muted">
          <span className="text-accent font-medium">Pulse · </span>{pulse}
        </p>
      )}
    </motion.section>
  );
}
