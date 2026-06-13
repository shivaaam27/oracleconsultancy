"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  { label: "General", items: [["about", "About you"], ["risk", "Risk rules"], ["location", "Location & weather"], ["swipe", "Swipe actions"], ["navigation", "Navigation"]] },
  { label: "Intelligence", items: [["ai", "AI assistance"], ["voice", "Voice"]] },
  { label: "Email & messaging", items: [["google", "Google Calendar"], ["email", "Email sending"], ["email-automation", "Email automation"], ["messaging", "Messaging"]] },
  { label: "Security & access", items: [["owner", "Owner sign-in"], ["passkeys", "Face ID & fingerprint"], ["portal", "Staff portal"]] },
  { label: "Device", items: [["notifications", "Notifications"], ["design", "Design"]] },
];

export function SettingsNav() {
  const [active, setActive] = useState("");

  useEffect(() => {
    const ids = GROUPS.flatMap((g) => g.items.map((i) => i[0]));
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 }
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* Mobile: horizontal chips */}
      <nav className="lg:hidden -mx-1 mb-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.flatMap((g) => g.items).map(([id, label]) => (
          <a key={id} href={`#${id}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs ring-1 transition-colors", active === id ? "bg-accent text-accent-fg ring-accent" : "bg-bg-subtle/70 ring-border text-fg-muted hover:text-fg")}>{label}</a>
        ))}
      </nav>

      {/* Desktop: sticky grouped sidebar */}
      <nav className="hidden self-start lg:sticky lg:top-20 lg:block">
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{g.label}</div>
              <div className="space-y-0.5">
                {g.items.map(([id, label]) => (
                  <a key={id} href={`#${id}`} className={cn("block rounded-lg px-2.5 py-1.5 text-[13px] transition-colors", active === id ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-bg-muted/50 hover:text-fg")}>{label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
