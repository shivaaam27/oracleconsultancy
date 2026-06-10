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

/** Compact live time + weather chip for the page hero. Weather is decorative —
 *  it fails quietly if the network call doesn't resolve. */
export function WeatherChip({ city, lat, lon }: { city: string; lat: number; lon: number }) {
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
    return () => { cancelled = true; };
  }, [lat, lon]);

  const hh = now ? String(now.getHours()).padStart(2, "0") : "--";
  const mm = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  const W = weather?.Icon;

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-bg-elev/60 px-3 py-1.5 text-xs ring-1 ring-border/60 backdrop-blur-sm">
      <span className="tabular font-semibold leading-none">
        {hh}<span className="animate-pulse text-fg-muted">:</span>{mm}
      </span>
      {weather && W && (
        <>
          <span className="h-3 w-px bg-border/70" />
          <span className="inline-flex items-center gap-1 text-accent">
            <W size={14} strokeWidth={2} />
            <span className="tabular font-semibold text-fg">{weather.temp}°</span>
          </span>
        </>
      )}
      <span className="hidden text-fg-muted sm:inline">· {city}</span>
    </div>
  );
}
