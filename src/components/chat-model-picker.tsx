"use client";
// ORI chat model picker — a small dropdown in the chat header. Options: "Auto
// (smart ladder)" [default + recommended] + each CHAT_MODELS entry, each showing
// its remaining free-tier quota inline ("22/30"). Selecting persists via
// /api/ai-usage/chat-model; the ask/chat path reads the setting and PINS it as
// the first ladder candidate (fallback intact). Fails open to Auto on any error.
//
// CAUTION surfaced to the owner: pinning a 30/day flash burns it fast — the
// remaining-quota hint lets them steer; Auto stays the safe default.

import { useEffect, useRef, useState } from "react";
import { Cpu, Check, ChevronDown } from "lucide-react";

type ChatModel = { model: string; quota: number | null; used: number; remaining: number | null };

function shortName(model: string): string {
  // "gemini-3.5-flash" → "3.5 Flash"; keep it compact for the header.
  return model.replace(/^gemini-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ChatModelPicker() {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [current, setCurrent] = useState<string>("auto");
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-usage/models", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        if (Array.isArray(d.chatModels)) setModels(d.chatModels as ChatModel[]);
        if (typeof d.currentChatModel === "string") setCurrent(d.currentChatModel);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function choose(model: string) {
    setCurrent(model); // optimistic
    setOpen(false);
    setSaving(true);
    try {
      const r = await fetch("/api/ai-usage/chat-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const d = r.ok ? await r.json() : null;
      if (d && typeof d.model === "string") setCurrent(d.model); // server-validated value
    } catch {
      // fail open — leave the optimistic value; the ask path ignores invalid ids
    } finally {
      setSaving(false);
    }
  }

  const label = current === "auto" ? "Auto" : shortName(current);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Chat model"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 h-7 rounded-lg px-2 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors tabular-nums"
      >
        <Cpu size={13} />
        <span className="max-w-[6rem] truncate">{label}</span>
        <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-8 z-50 w-64 rounded-xl border border-border bg-bg-elev shadow-lg p-1 text-sm"
        >
          <Option
            label="Auto (smart ladder)"
            hint="Best model with quota — recommended"
            selected={current === "auto"}
            onClick={() => choose("auto")}
          />
          <div className="my-1 h-px bg-border/60" />
          {models.map((m) => (
            <Option
              key={m.model}
              label={shortName(m.model)}
              hint={
                m.quota != null
                  ? `${m.remaining ?? 0}/${m.quota} left today`
                  : "usage not tracked"
              }
              selected={current === m.model}
              onClick={() => choose(m.model)}
            />
          ))}
          <p className="px-2.5 py-1.5 text-[10px] text-fg-subtle leading-snug">
            Pinning a 30/day model burns it fast. Auto stays recommended.
          </p>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{saving ? "Saving model choice" : ""}</span>
    </div>
  );
}

function Option({
  label, hint, selected, onClick,
}: { label: string; hint: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-bg-muted/60 transition-colors"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-fg truncate">{label}</span>
        <span className="block text-[11px] text-fg-subtle tabular-nums">{hint}</span>
      </span>
      {selected && <Check size={14} className="text-accent shrink-0" />}
    </button>
  );
}
