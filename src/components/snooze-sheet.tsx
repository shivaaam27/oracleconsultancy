"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, CalendarDays, CalendarClock, Calendar, Check } from "lucide-react";
import { spring } from "@/lib/motion";

/** End-of-day ISO for a date that is `days` from now (keeps deadlines tidy at 17:00). */
export function snoozeIso(base: number, days: number): string {
  const d = new Date(base + days * 86400000);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

/**
 * iOS-style snooze chooser. Opened from a peek/quick-action; offers presets plus
 * a "pick a date" calendar. Calls onPick(iso) then closes.
 */
export function SnoozeSheet({
  open, onClose, onPick, label,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (iso: string) => void;
  label?: string;
}) {
  const [date, setDate] = useState("");

  function pickPreset(days: number) {
    onPick(snoozeIso(Date.now(), days));
    onClose();
  }
  function pickDate() {
    if (!date) return;
    const d = new Date(`${date}T17:00:00`);
    onPick(d.toISOString());
    onClose();
    setDate("");
  }

  const presets = [
    { label: "Tomorrow", icon: <Sun size={16} />, days: 1 },
    { label: "In 3 days", icon: <CalendarDays size={16} />, days: 3 },
    { label: "Next week", icon: <CalendarClock size={16} />, days: 7 },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[88] bg-black/45 backdrop-blur-[3px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={spring}
            className="fixed z-[89] inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[360px] mx-auto select-none"
          >
            <div className="glass glass-menu rounded-2xl overflow-hidden">
              <div className="px-4 py-3 text-sm font-semibold border-b border-border/60">
                {label || "Snooze until…"}
              </div>
              <div className="divide-y divide-border/60">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => pickPreset(p.days)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-fg active:bg-bg-muted/60 transition-colors"
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border/60">
                <Calendar size={16} className="text-fg-muted shrink-0" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={pickDate}
                  disabled={!date}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-fg px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  <Check size={14} /> Set
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
