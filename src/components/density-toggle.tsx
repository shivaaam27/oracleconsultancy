"use client";
import { useEffect, useState } from "react";
import { Rows3, Rows2 } from "lucide-react";
import { cn } from "@/lib/cn";

const KEY = "cos-density";

function applyDensity(d: "comfortable" | "compact") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-density", d);
}

export function DensityScript() {
  // Inline script that runs before hydration to avoid a flash.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var d=localStorage.getItem('${KEY}')||'comfortable';document.documentElement.setAttribute('data-density',d);}catch(e){}`,
      }}
    />
  );
}

export function DensityToggle({ className }: { className?: string }) {
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as "comfortable" | "compact" | null) ?? "comfortable";
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
        "inline-flex items-center justify-center p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors",
        className
      )}
    >
      <Icon size={14} />
    </button>
  );
}
