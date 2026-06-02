"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useContextActions } from "@/components/context-actions";

/** Registers the Home/overview contextual action: the universal Create launcher. */
export function HomeActions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function openCreate() {
    const p = new URLSearchParams(searchParams.toString());
    p.set("capture", "open");
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }

  useContextActions(
    "home",
    [{ id: "create", label: "Create", icon: <Plus size={16} />, onClick: openCreate, primary: true, tone: "accent" }],
    [pathname]
  );
  return null;
}
