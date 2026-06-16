"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, Building2, User, CalendarDays, Plus, X } from "lucide-react";
import { FluidSelect, type FluidOption } from "./fluid-select";
import { Combobox } from "./combobox";
import { Button, FieldLabel } from "./ui";
import { useToast } from "./toast";
import { createCaptureTask } from "@/app/capture/actions";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * QuickTaskPopover — 1-to-2-touch task create, the Aurora way.
 *
 * Four fields with smart defaults — Action · Company (pre-selected) ·
 * Assignee · Deadline — in a small glass popover. Everything else (priority,
 * category, risk, meeting link, …) sits behind a quiet "Full form →" link to
 * the existing /task/new modal, which is left untouched.
 *
 * Reuses the existing createCaptureTask server action (no new action), the
 * shared FluidSelect + Combobox, Button, and the toast/undo wiring. On success
 * it closes optimistically and shows a toast with Undo.
 *
 * Controlled: the host (the `+` action / inline "Add a task…") owns open state.
 * Pass `companies` (required) and optional `people` for assignee suggestions.
 * ------------------------------------------------------------------ */

export type QuickTaskCompany = { id: number; name: string };

export function QuickTaskPopover({
  open,
  onClose,
  companies,
  people = [],
  defaultCompanyId,
  onCreated,
  fullFormHref = "/task/new",
}: {
  open: boolean;
  onClose: () => void;
  companies: QuickTaskCompany[];
  /** Optional people names for the assignee combobox suggestions. */
  people?: string[];
  /** Pre-select this company; falls back to the first company. */
  defaultCompanyId?: number;
  /** Called with the new task code after a successful create. */
  onCreated?: (code: string) => void;
  /** "Full form →" target (keep the intercepting modal intact). */
  fullFormHref?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLTextAreaElement>(null);

  const firstCompany = defaultCompanyId ?? companies[0]?.id;
  const [companyId, setCompanyId] = useState<number | undefined>(firstCompany);
  const [action, setAction] = useState("");
  const [assignee, setAssignee] = useState("");
  const [deadline, setDeadline] = useState("");
  // Portal target only exists in the browser — gate so SSR renders nothing.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Reset + focus the action field each time it opens (pre-select stays smart).
  useEffect(() => {
    if (!open) return;
    setCompanyId(defaultCompanyId ?? companies[0]?.id);
    setAction("");
    setAssignee("");
    setDeadline("");
    const id = requestAnimationFrame(() => actionRef.current?.focus());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const companyOptions: FluidOption[] = companies.map((c) => ({ value: String(c.id), label: c.name }));

  function submit() {
    const text = action.trim();
    if (!text) { actionRef.current?.focus(); return; }
    if (!companyId) { toast("Pick a company first.", { tone: "warn" }); return; }
    start(async () => {
      const res = await createCaptureTask({
        companyId,
        actionItem: text,
        priority: "Medium",
        status: "Not Started",
        deadline: deadline ? new Date(`${deadline}T17:00:00`).toISOString() : null,
        assignees: assignee.trim() || undefined,
      });
      if (!res.ok || !res.code) {
        toast(res.error || "Couldn't create the task.", { tone: "danger" });
        return;
      }
      const code = res.code;
      onClose();
      toast(`${code} created.`, {
        tone: "success",
        duration: 8000,
        action: {
          label: "Open",
          onClick: () => router.push(`/?tab=tasks&task=${code}`),
        },
      });
      onCreated?.(code);
      router.refresh();
    });
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-[3px]"
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Quick add task"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={spring}
            className="fixed z-[111] inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px] mx-auto"
          >
            <div className="glass glass-menu elevated rounded-3xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Plus size={15} className="text-accent" /> Quick add task
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="text-fg-subtle hover:text-fg transition-colors p-1 -mr-1"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-4 pb-4 pt-2 flex flex-col gap-3">
                {/* Action */}
                <div>
                  <FieldLabel>What needs doing?</FieldLabel>
                  <textarea
                    ref={actionRef}
                    rows={2}
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
                    placeholder="e.g. Chase the packaging supplier for an ETA"
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none border border-border bg-bg-subtle/60 focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-fg-subtle"
                  />
                </div>

                {/* Company + Assignee row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>
                      <span className="inline-flex items-center gap-1.5"><Building2 size={11} /> Company</span>
                    </FieldLabel>
                    <FluidSelect
                      value={companyId != null ? String(companyId) : ""}
                      options={companyOptions}
                      onSelect={(v) => setCompanyId(Number(v))}
                      placeholder="Pick a company"
                      className="w-full"
                      buttonClassName="w-full justify-between"
                    />
                  </div>
                  <div>
                    <FieldLabel>
                      <span className="inline-flex items-center gap-1.5"><User size={11} /> Assignee</span>
                    </FieldLabel>
                    <Combobox
                      options={people}
                      defaultValue=""
                      placeholder="Optional"
                      onInput={setAssignee}
                      onCommit={setAssignee}
                      className="w-full px-3 py-1.5 text-sm h-9 rounded-lg border border-border bg-bg-subtle/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                  </div>
                </div>

                {/* Deadline */}
                <div>
                  <FieldLabel>
                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={11} /> Deadline</span>
                  </FieldLabel>
                  <input
                    type="date"
                    value={deadline}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm h-9 rounded-lg border border-border bg-bg-subtle/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1">
                  <Link
                    href={fullFormHref}
                    onClick={onClose}
                    className="text-xs text-fg-muted hover:text-accent inline-flex items-center gap-1 transition-colors"
                  >
                    Full form <ArrowRight size={12} />
                  </Link>
                  <Button onClick={submit} disabled={pending || !action.trim()} size="md">
                    {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Add task
                  </Button>
                </div>
                <p className="text-[10px] text-fg-subtle -mt-1">
                  Priority defaults to Medium · ⌘↵ to save
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
