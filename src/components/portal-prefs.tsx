"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { DENSITY_KEY, applyDensity, type Density } from "./density-toggle";

/* Accessibility preferences for the staff portal. Stored on this device
 * (localStorage) and applied as attributes on <html> so the CSS in
 * globals.css can react. Density reuses the existing DensityToggle. */

const TEXT_KEY = "cos-text-size";
const MOTION_KEY = "cos-motion";

type TextSize = "base" | "large" | "xlarge";
type Motion = "full" | "reduced";

/** Inline, pre-hydration script — prevents a flash of the wrong size/motion.
 *  Mount once in the root layout <head>, beside DensityScript. */
export function PortalPrefsScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var t=localStorage.getItem('${TEXT_KEY}');if(t&&t!=='base')document.documentElement.setAttribute('data-text-size',t);var m=localStorage.getItem('${MOTION_KEY}');if(m==='reduced')document.documentElement.setAttribute('data-motion','reduced');}catch(e){}`,
      }}
    />
  );
}

function applyText(t: TextSize) {
  if (t === "base") document.documentElement.removeAttribute("data-text-size");
  else document.documentElement.setAttribute("data-text-size", t);
}
function applyMotion(m: Motion) {
  if (m === "reduced") document.documentElement.setAttribute("data-motion", "reduced");
  else document.documentElement.removeAttribute("data-motion");
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    // Micro tier: 24px segments inside a 28px shell, the same shape as the
    // "This task / All tasks" toggle. Heights are explicit — from padding they
    // came out at 27px, which matched nothing else on the page.
    <div className="inline-flex rounded-md bg-bg-subtle ring-1 ring-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-6 items-center rounded px-2.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AccessibilityControls() {
  const [text, setText] = useState<TextSize>("base");
  const [motion, setMotion] = useState<Motion>("full");
  // The portal defaults to Comfortable (phone-first) — the same fallback
  // DensityToggle and DensityScript use, so all three agree on a fresh device.
  const [density, setDensity] = useState<Density>("comfortable");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setText((localStorage.getItem(TEXT_KEY) as TextSize) || "base");
    setMotion((localStorage.getItem(MOTION_KEY) as Motion) || "full");
    setDensity((localStorage.getItem(DENSITY_KEY) as Density) || "comfortable");
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-40" />;

  return (
    <div className="flex flex-col gap-4">
      <Row label="Text size" hint="Make everything larger and easier to read.">
        <Segmented
          value={text}
          onChange={(v) => {
            setText(v);
            localStorage.setItem(TEXT_KEY, v);
            applyText(v);
          }}
          options={[
            { value: "base", label: "Normal" },
            { value: "large", label: "Large" },
            { value: "xlarge", label: "Largest" },
          ]}
        />
      </Row>

      <Row label="Motion" hint="Reduce animations if movement is distracting.">
        <Segmented
          value={motion}
          onChange={(v) => {
            setMotion(v);
            localStorage.setItem(MOTION_KEY, v);
            applyMotion(v);
          }}
          options={[
            { value: "full", label: "Full" },
            { value: "reduced", label: "Reduced" },
          ]}
        />
      </Row>

      {/* Segmented, like Text size and Motion above it. It used to be the
          icon-only DensityToggle beside the words "Tap to switch", which said
          what to DO but never which density was on — the state lived in an
          icon and a `title` tooltip, and a phone has no hover to show one. */}
      <Row label="Density" hint="Tighter spacing fits more on screen.">
        <Segmented
          value={density}
          onChange={(v) => {
            setDensity(v);
            localStorage.setItem(DENSITY_KEY, v);
            applyDensity(v);
          }}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
      </Row>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-fg-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** Tiny confirmation toast used after saving voice language, etc. */
export function SavedTick({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <Check size={12} /> Saved
    </span>
  );
}
