"use client";

import { useEffect, useState } from "react";
import {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, CloudLightning, type LucideIcon,
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

/** Shared live clock + weather hook. Weather is decorative — fails quietly. */
function useClockWeather(lat: number, lon: number) {
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
        const { label, Icon } = wmo(Number(d.current.weather_code));
        setWeather({ temp: Math.round(d.current.temperature_2m), label, Icon });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  const hh = now ? String(now.getHours()).padStart(2, "0") : "--";
  const mm = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  return { now, weather, hh, mm };
}

/** A larger live time + weather card for the Home hero. Glassy, with a subtle
 *  sky-tinted gradient and a soft glow behind the condition icon. */
export function WeatherWidget({ city, lat, lon }: { city: string; lat: number; lon: number }) {
  const { weather, hh, mm } = useClockWeather(lat, lon);
  const W = weather?.Icon;
  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-gradient-to-br from-accent-soft/50 via-bg-elev/50 to-info-soft/40 px-4 py-3 ring-1 ring-border/60 backdrop-blur-md">
      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/25 to-info/15 text-accent ring-1 ring-accent/20">
        {W ? <W size={26} strokeWidth={2} /> : <Cloud size={26} strokeWidth={2} className="text-fg-subtle" />}
      </span>
      <div className="leading-none">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[26px] font-semibold tabular tracking-tight">{weather ? `${weather.temp}°` : "—"}</span>
          {weather && <span className="text-xs font-medium text-fg-muted">{weather.label}</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="tabular font-semibold text-fg">
            {hh}
            <span className="animate-pulse text-fg-muted">:</span>
            {mm}
          </span>
          <span className="h-1 w-1 rounded-full bg-fg-subtle/50" />
          <span className="truncate">{city}</span>
        </div>
      </div>
    </div>
  );
}
