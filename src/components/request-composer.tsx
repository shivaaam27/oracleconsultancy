"use client";

import { useState, useTransition } from "react";
import { Plus, Send, Loader2, X, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { useToast } from "./toast";
import { REQUEST_CATEGORIES, type RequestRecipient } from "@/lib/requests-shared";
import { portalRaiseRequest } from "@/app/portal/(app)/requests/actions";

/** Staff "raise a request" form. Addresses ONE recipient (a person from the
 *  allowed list, or the owner) — structured, not free chat. */
export function RequestComposer({ recipients }: { recipients: RequestRecipient[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    fd.set("category", category);
    setBusy(true);
    startTransition(async () => {
      // On success the action redirects to the new request; we only return here
      // when it reports a problem.
      const res = await portalRaiseRequest(null, fd);
      setBusy(false);
      if (res?.error) toast(res.error, { tone: "danger" });
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-accent text-accent-fg px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        <Plus size={16} /> Raise a request
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="rounded-2xl bg-bg-elev ring-1 ring-border p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Raise a request</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-fg-muted hover:text-fg">
          <X size={16} />
        </button>
      </div>

      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">To</span>
        <select
          name="addresseeId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="" disabled>
            Choose who this is for…
          </option>
          <option value="owner">Oracle Consultancy (the owner)</option>
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.relation}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Type</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {REQUEST_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? "" : c)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs ring-1 transition-colors",
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
          className="mt-1.5 w-full rounded-md bg-bg-elev text-xs ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">What do you need?</span>
        <input
          name="title"
          required
          maxLength={140}
          placeholder="e.g. New laptop for design work"
          className="mt-1 w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Details (optional)</span>
        <textarea
          name="body"
          rows={3}
          placeholder="Add anything that helps."
          className="mt-1 w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
        <Paperclip size={14} />
        <span>Add a photo or file (optional)</span>
        <input type="file" name="attachment" accept="image/*,.pdf,.doc,.docx" className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-bg-muted file:px-2 file:py-1 file:text-xs file:text-fg-muted" />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send request
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
