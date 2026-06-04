"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Boxes, ArrowDownToLine, ArrowUpFromLine, ChevronLeft } from "lucide-react";
import { Segmented } from "@/components/macos";

export type HrmsTab = "dashboard" | "register" | "purchases" | "issues";

const TABS: { value: HrmsTab; label: string; icon: React.ReactNode }[] = [
  { value: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={14} /> },
  { value: "register", label: "Register", icon: <Boxes size={14} /> },
  { value: "purchases", label: "Purchases — In", icon: <ArrowDownToLine size={14} /> },
  { value: "issues", label: "Issues — Out", icon: <ArrowUpFromLine size={14} /> },
];

/**
 * HRMS page shell — header + sub-tab switcher. Mirrors WorkbookShell: the
 * chosen tab is kept in the URL (?tab=) so refresh, back, and deep links land
 * on the right section. Each tab's content is passed in as a slot so the panels
 * can stay server-rendered.
 */
export function HrmsShell({
  title = "Stock Control",
  titleSub,
  sub,
  dashboardSlot,
  registerSlot,
  purchasesSlot,
  issuesSlot,
  initialTab = "dashboard",
}: {
  title?: string;
  titleSub?: string;
  sub?: React.ReactNode;
  dashboardSlot: React.ReactNode;
  registerSlot: React.ReactNode;
  purchasesSlot: React.ReactNode;
  issuesSlot: React.ReactNode;
  initialTab?: HrmsTab;
}) {
  const [tab, setTabState] = useState<HrmsTab>(initialTab);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setTab = useCallback((next: HrmsTab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "dashboard") params.delete("tab");
    else params.set("tab", next);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const slot =
    tab === "dashboard" ? dashboardSlot
    : tab === "register" ? registerSlot
    : tab === "purchases" ? purchasesSlot
    : issuesSlot;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href="/hrms" className="inline-flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-0.5 hover:underline">
            <ChevronLeft size={12} /> HRMS
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {titleSub && <div className="text-xs text-fg-subtle">{titleSub}</div>}
          {sub && <div className="text-xs text-fg-muted mt-0.5">{sub}</div>}
        </div>
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>

      {/* The one rule everything rests on — a quiet nod, not a spreadsheet. */}
      <div className="text-[11px] text-fg-subtle tabular">
        current stock = opening + purchased − issued
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
        >
          {slot}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
