"use client";
import { useEffect, useState } from "react";
import { Rows3, Rows2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const DENSITY_KEY = "cos-density";
const KEY = DENSITY_KEY;

export type Density = "comfortable" | "compact";

export function applyDensity(d: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-density", d);
}

export function DensityScript() {
  // Inline script that runs before hydration to avoid a flash.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var d=localStorage.getItem('${KEY}')||(location.pathname.indexOf('/portal')===0?'comfortable':'compact');document.documentElement.setAttribute('data-density',d);}catch(e){}`,
      }}
    />
  );
}

export function DensityToggle({ className }: { className?: string }) {
  // Compact is the default on the admin side (owner's call, Aug 2026) — ERPNext's
  // own tight mode. The staff portal stays Comfortable: it is phone-first, and
  // density on a phone is a downgrade. Either way the toggle still decides.
  const [density, setDensity] = useState<"comfortable" | "compact">("compact");

  useEffect(() => {
    const fallback = window.location.pathname.startsWith("/portal") ? "comfortable" : "compact";
    const stored = (localStorage.getItem(KEY) as "comfortable" | "compact" | null) ?? fallback;
    setDensity(stored);
    applyDensity(stored);
  }, []);

  const toggle = () => {
    const next = density === "comfortable" ? "compact" : "comfortable";
    setDensity(next);
    localStorage.setItem(KEY, next);
    applyDensity(next);
  };

  const Icon = density === "comfortable" ? Rows3 : Rows2;

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Density: ${density}`}
      aria-label="Toggle density"
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors",
        className
      )}
    >
      <Icon size={14} />
    </button>
  );
}
