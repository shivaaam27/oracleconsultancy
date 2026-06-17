"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Send, Loader2, Paperclip, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { BottomSheet } from "./bottom-sheet";
import { useToast } from "./toast";
import { REQUEST_CATEGORIES, type RequestRecipient } from "@/lib/requests-shared";

type RaiseAction = (prev: { error: string } | null, formData: FormData) => Promise<{ error: string } | null>;

const FORM_ID = "request-composer-form";

/** Raise a request, addressed to one OR several recipients, in an iPhone
 *  bottom-sheet. Used on the staff portal (allowed people + the owner; pass
 *  `fab` for the thumb-reach floating trigger) and the owner's control centre. */
export function RequestComposer({
  recipients,
  action,
  allowOwner = false,
  label = "Raise a request",
  categories = REQUEST_CATEGORIES,
  fab = false,
}: {
  recipients: RequestRecipient[];
  action: RaiseAction;
  allowOwner?: boolean;
  label?: string;
  categories?: string[];
  fab?: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ownerSel, setOwnerSel] = useState(false);
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? recipients.filter((r) => `${r.name} ${r.relation}`.toLowerCase().includes(q)) : recipients;
  }, [filter, recipients]);

  const count = selected.size + (ownerSel ? 1 : 0);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setSelected(new Set()); setOwnerSel(false); setCategory(""); setFilter("");
  }

  function submit(form: HTMLFormElement) {
    if (count === 0) {
      toast("Choose at least one person to send this to.", { tone: "danger" });
      return;
    }
    const fd = new FormData(form);
    fd.set("category", category);
    fd.set("recipientIds", [...selected].join(","));
    fd.set("toOwner", ownerSel ? "1" : "");
    setBusy(true);
    startTransition(async () => {
      const res = await action(null, fd);
      setBusy(false);
      if (res?.error) { toast(res.error, { tone: "danger" }); return; }
      toast("Request sent.", { tone: "success" });
      setOpen(false);
      reset();
    });
  }

  const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
  const fieldCls = "bare-field w-full rounded-xl ring-1 ring-border px-3.5 py-3 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40 caret-accent";

  return (
    <>
      {/* Triggers. Portal (fab) gets a thumb-reach FAB on mobile + a desktop
          button; the admin centre gets a full-width button. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-[0.99]",
          fab ? "hidden sm:flex" : "flex"
        )}
      >
        <Plus size={16} /> {label}
      </button>
      {fab && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg shadow-accent/30 transition-transform active:scale-95 sm:hidden"
        >
          <Plus size={24} strokeWidth={2.4} />
        </button>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        icon={<Send size={16} />}
        footer={
          <button
            type="submit"
            form={FORM_ID}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send request{count > 0 ? ` · ${count}` : ""}
          </button>
        }
      >
        <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="flex flex-col gap-4">
          <div>
            <span className={fieldLabel}>To {count > 0 && <span className="text-accent">· {count} selected</span>}</span>
            {recipients.length > 8 && (
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search people…"
                className={cn(fieldCls, "mb-1.5 py-2.5")}
              />
            )}
            <div className="max-h-48 overflow-y-auto overscroll-contain rounded-xl ring-1 ring-border divide-y divide-border/50">
              {allowOwner && (
                <button
                  type="button"
                  onClick={() => setOwnerSel((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-bg-muted/50"
                >
                  <span>Oracle Consultancy <span className="text-xs text-fg-subtle">· the owner</span></span>
                  {ownerSel && <Check size={15} className="shrink-0 text-accent" />}
                </button>
              )}
              {filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-bg-muted/50"
                >
                  <span className="min-w-0 truncate">{r.name} <span className="text-xs text-fg-subtle">· {r.relation}</span></span>
                  {selected.has(r.id) && <Check size={15} className="shrink-0 text-accent" />}
                </button>
              ))}
              {filtered.length === 0 && !allowOwner && <p className="px-3.5 py-3 text-xs text-fg-muted">No one to show.</p>}
            </div>
          </div>

          <div>
            <span className={fieldLabel}>Type</span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(category === c ? "" : c)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs ring-1 transition-colors active:scale-95",
                    category === c ? "bg-accent-soft text-accent ring-accent/30" : "text-fg-muted ring-border hover:bg-bg-muted"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="…or type your own"
              className={cn(fieldCls, "mt-2 py-2.5")}
            />
          </div>

          <div>
            <label className={fieldLabel}>What&apos;s needed?</label>
            <input name="title" required maxLength={140} placeholder="e.g. New laptop for design work" className={fieldCls} />
          </div>

          <div>
            <label className={fieldLabel}>Details (optional)</label>
            <textarea name="body" rows={3} placeholder="Add anything that helps." className={cn(fieldCls, "resize-y")} />
          </div>

          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <Paperclip size={14} />
            <span>Add a photo or file (optional)</span>
            <input type="file" name="attachment" accept="image/*,.pdf,.doc,.docx" className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-bg-muted file:px-2 file:py-1 file:text-xs file:text-fg-muted" />
          </label>
        </form>
      </BottomSheet>
    </>
  );
}
