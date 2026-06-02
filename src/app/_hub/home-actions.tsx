"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { useContextActions } from "@/components/context-actions";

/** Registers the Home/overview contextual action: Quick capture. */
export function HomeActions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function openCapture() {
    const p = new URLSearchParams(searchParams.toString());
    p.set("capture", "open");
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }

  useContextActions(
    "home",
    [{ id: "quick-capture", label: "Quick capture", icon: <Zap size={16} />, onClick: openCapture, primary: true, tone: "accent" }],
    [pathname]
  );
  return null;
}
