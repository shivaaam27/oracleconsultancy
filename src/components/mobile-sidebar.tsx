"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarContent } from "./sidebar";

type Company = { id: number; name: string; code: string };

export const MOBILE_NAV_EVENT = "cos:open-mobilenav";

/** Fire from anywhere (e.g. the bottom pill) to open the mobile nav drawer. */
export function openMobileNav() {
  window.dispatchEvent(new Event(MOBILE_NAV_EVENT));
}

/** Mobile-only left slide-over that reuses the desktop sidebar content. */
export function MobileSidebar({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(MOBILE_NAV_EVENT, onOpen);
    return () => window.removeEventListener(MOBILE_NAV_EVENT, onOpen);
  }, []);

  // Close on navigation and on Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="fixed left-0 top-0 bottom-0 z-[76] w-64 max-w-[82vw] glass pb-[env(safe-area-inset-bottom)]"
            >
              <SidebarContent companies={companies} onNavigate={() => setOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
