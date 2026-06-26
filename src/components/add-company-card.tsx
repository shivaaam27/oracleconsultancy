"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2, X } from "lucide-react";
import { Button } from "./ui";
import { useToast } from "./toast";
import { createCompany } from "@/app/companies/reference-actions";

/** Inline "Add company" affordance for the Companies hub. Collapsed it's a
 *  dashed tile that matches the company-card grid; expanded it's a small form
 *  (name + task-code prefix + optional accent colour). */
export function AddCompanyCard() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [accent, setAccent] = useState("#6366f1");

  // Suggest a 2-letter prefix from the company name as the owner types it,
  // unless they've already typed their own.
  const [prefixTouched, setPrefixTouched] = useState(false);
  function onName(v: string) {
    setName(v);
    if (!prefixTouched) {
      const words = v.trim().split(/\s+/).filter(Boolean);
      const guess = words.length >= 2
        ? (words[0][0] + words[1][0])
        : v.trim().slice(0, 2);
      setPrefix(guess.toUpperCase());
    }
  }

  function submit() {
    if (!name.trim()) { toast("Enter a company name.", { tone: "warn" }); return; }
    start(async () => {
      const res = await createCompany(name, prefix, accent);
      if (res.ok) {
        toast(`Added ${name.trim()}`, { tone: "success" });
        setName(""); setPrefix(""); setPrefixTouched(false); setOpen(false);
        router.refresh();
      } else {
        toast(res.error, { tone: "warn" });
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-h-[150px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 text-fg-muted transition-all hover:border-accent/50 hover:bg-bg-muted/40 hover:text-accent"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle ring-1 ring-border transition-colors group-hover:bg-accent group-hover:text-accent-fg">
          <Plus size={18} />
        </span>
        <span className="text-sm font-medium">Add a company</span>
      </button>
    );
  }

  return (
    <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Building2 size={15} className="text-accent" /> New company
        </div>
        <button type="button" onClick={() => setOpen(false)} className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted/60"><X size={15} /></button>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="text-[11px] font-medium text-fg-subtle">Name</label>
          <input
            value={name} autoFocus onChange={(e) => onName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="e.g. Cocozuri Chocolat"
            className="mt-1 w-full rounded-lg bg-bg-subtle text-sm text-fg ring-1 ring-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex items-end gap-2.5">
          <div className="flex-1">
            <label className="text-[11px] font-medium text-fg-subtle">Task-code prefix</label>
            <input
              value={prefix}
              onChange={(e) => { setPrefixTouched(true); setPrefix(e.target.value.toUpperCase().slice(0, 4)); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="DS"
              className="mt-1 w-full rounded-lg bg-bg-subtle text-sm font-mono uppercase tracking-wider text-fg ring-1 ring-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-fg-subtle">Colour</label>
            <input
              type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
              className="mt-1 h-[38px] w-12 rounded-lg bg-bg-subtle ring-1 ring-border p-1 cursor-pointer"
            />
          </div>
        </div>
        <p className="text-[11px] text-fg-subtle">Tasks for this company will be coded <span className="font-mono">{(prefix || "XX")}-001</span>, <span className="font-mono">{(prefix || "XX")}-002</span>…</p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" disabled={busy || !name.trim()} onClick={submit}><Plus size={14} /> {busy ? "Adding…" : "Add company"}</Button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-fg-muted hover:text-fg px-2">Cancel</button>
      </div>
    </div>
  );
}
