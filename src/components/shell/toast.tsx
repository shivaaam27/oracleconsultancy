"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "default" | "success" | "warn" | "danger" | "info";
type ToastAction = { label: string; onClick: () => void | Promise<void> };
type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  description?: string;
  duration: number;
  action?: ToastAction;
};

type Ctx = {
  toast: (
    message: string,
    opts?: {
      tone?: ToastTone;
      description?: string;
      duration?: number;
      action?: ToastAction;
    }
  ) => void;
  dismiss: (id: number) => void;
};

const ToastCtx = createContext<Ctx | null>(null);
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const toneIcon = {
  default: <Info size={14} />,
  success: <CheckCircle2 size={14} />,
  warn: <AlertTriangle size={14} />,
  danger: <AlertOctagon size={14} />,
  info: <Info size={14} />,
};

const toneClass: Record<ToastTone, string> = {
  default: "text-fg",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback<Ctx["toast"]>((message, opts) => {
    const id = Date.now() + Math.random();
    const t: Toast = {
      id,
      message,
      tone: opts?.tone ?? "default",
      description: opts?.description,
      duration: opts?.duration ?? 4000,
      action: opts?.action,
    };
    setToasts((cur) => [...cur, t]);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), t.duration)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto vibrancy-strong rounded-2xl shadow-lg px-3.5 py-3 min-w-[260px] max-w-sm flex items-start gap-2.5"
            >
              <span className={cn("mt-0.5", toneClass[t.tone])}>{toneIcon[t.tone]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight">{t.message}</div>
                {t.description && (
                  <div className="text-xs text-fg-muted mt-0.5">{t.description}</div>
                )}
              </div>
              {t.action && (
                <button
                  onClick={async () => {
                    try {
                      await t.action!.onClick();
                    } finally {
                      dismiss(t.id);
                    }
                  }}
                  className="text-xs font-semibold px-2 py-1 rounded-md bg-bg-muted hover:bg-bg-elev text-fg transition-colors"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                className="text-fg-subtle hover:text-fg transition-colors -mr-1 -mt-1 p-1"
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
