"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, TriangleAlert } from "lucide-react";

export const authInputCls =
  "w-full rounded-2xl bg-bg-subtle ring-1 ring-border px-4 py-3 text-sm outline-none focus:ring-accent/50 transition-shadow";

/** Password input with show/hide eye and a caps-lock warning. */
export function PasswordField({
  name,
  label,
  autoComplete,
  minLength,
}: {
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">{label}</span>
      <div className="relative">
        <input
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          placeholder="••••••••"
          className={authInputCls + " pr-11"}
          onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState("CapsLock"))}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg transition-colors"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {caps && (
        <span className="inline-flex items-center gap-1 text-[11px] text-warn">
          <TriangleAlert size={11} /> Caps Lock is on
        </span>
      )}
    </label>
  );
}

/** Wraps form content; gives a polite shake whenever `errorKey` changes. */
export function ShakeOnError({ errorKey, children }: { errorKey: string | null; children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (errorKey) setTick((t) => t + 1);
  }, [errorKey]);
  return (
    <motion.div
      key={tick}
      initial={tick > 0 ? { x: 0 } : false}
      animate={tick > 0 ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}
