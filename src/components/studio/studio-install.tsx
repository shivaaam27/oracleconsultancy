"use client";

/**
 * "Install Oracle" — the Settings card, minimal and icon-led (owner, 25 Sept
 * 2026: "there is so much info, make it minimal and icon based"; and the name
 * is Oracle, never COS). Three tiles — desk, iPhone, Android — each with its
 * route in a few words, the one for THIS device lit. Where the browser can
 * install in one click, one button does it.
 */
import { Check, Download, Monitor, MoreVertical, Share, Smartphone, TabletSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useInstall } from "@/components/install-app";
import { stBtn } from "@/components/studio/kit";
import { cn } from "@/lib/cn";

type Device = "desk" | "iphone" | "android";

export function StudioInstall() {
  const { mode, busy, install } = useInstall();
  const [device, setDevice] = useState<Device | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    setDevice(/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document) ? "iphone" : /Android/.test(ua) ? "android" : "desk");
  }, []);

  const tiles: { id: Device; icon: React.ReactNode; name: string; how: React.ReactNode }[] = [
    { id: "desk", icon: <Monitor size={18} />, name: "Windows · Mac", how: <>Edge or Chrome <Download size={11} className="inline" /> in the address bar</> },
    { id: "iphone", icon: <Smartphone size={18} />, name: "iPhone · iPad", how: <>Safari <Share size={11} className="inline" /> → Add to Home Screen</> },
    { id: "android", icon: <TabletSmartphone size={18} />, name: "Android", how: <>Chrome <MoreVertical size={11} className="inline" /> → Install app</> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.id} className={cn("flex min-w-0 flex-col gap-2 rounded-[12px] border px-2.5 py-2.5",
            device === t.id ? "border-[#F2F2F0]/40 bg-[var(--st-card-3)]" : "border-[var(--st-card-line)] bg-[var(--st-card-2)]")}>
            <span className={cn("grid h-8 w-8 place-items-center rounded-[9px]", device === t.id ? "bg-[#F2F2F0] text-[#111214]" : "bg-[var(--st-card-3)] text-[var(--st-on-card)]")}>{t.icon}</span>
            <span className="text-[12px] font-medium leading-tight text-[var(--st-on-card)]">{t.name}</span>
            <span className="text-[11px] leading-snug text-[var(--st-on-card-muted)]">{t.how}</span>
          </div>
        ))}
      </div>
      {mode === "ready" && (
        <button type="button" onClick={() => void install()} disabled={busy} className={cn(stBtn.onCard, "h-9 w-fit px-3.5 text-[13px]")}>
          <Download size={14} />{busy ? "Installing…" : "Install on this device"}
        </button>
      )}
      {mode === "installed" && (
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--st-ok)]"><Check size={13} />Installed on this device</span>
      )}
    </div>
  );
}
