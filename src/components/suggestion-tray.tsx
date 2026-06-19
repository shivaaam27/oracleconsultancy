"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, X, Loader2, CheckCheck, RotateCcw, ChevronDown } from "lucide-react";
import {
  acceptSuggestionAction,
  dismissSuggestionAction,
  acceptAllSuggestionsAction,
  undoSuggestionAction,
} from "@/app/suggestions/actions";
import { useToast } from "@/components/toast";
import type { ProfileSuggestion } from "@/lib/profile-suggestions";

const KIND_LABEL: Record<string, string> = {
  "company-field": "Profile",
  "person-field": "Profile",
  fact: "Fact",
  "new-shelf": "New shelf",
  "new-structure": "New department",
};

function Tag({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft/60 ring-1 ring-accent/20 text-accent px-2 py-0.5 text-[10px] font-medium">
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

/**
 * "Suggested additions" — the system telling the owner what to add. Profile
 * fields + ledger facts the AI read off filed documents, proposed for a one-tap
 * Accept (writes through, blanks-only) or Dismiss. Always-ask-first: nothing here
 * changed the record on its own. Shown on the company profile + person drawer.
 */
export function SuggestionTray({
  suggestions,
  applied = [],
  companyId,
  personId,
}: {
  suggestions: ProfileSuggestion[];
  applied?: ProfileSuggestion[];
  companyId?: number;
  personId?: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [allBusy, startAll] = useTransition();
  const [showApplied, setShowApplied] = useState(false);

  if (suggestions.length === 0 && applied.length === 0) return null;

  function act(id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(id);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) { toast(res.error ?? "Could not do that.", { tone: "danger" }); return; }
      toast(okMsg, { tone: "success" });
      router.refresh();
    });
  }

  function acceptAll() {
    startAll(async () => {
      const res = await acceptAllSuggestionsAction({ companyId, personId });
      if (res.ok) toast(`Added ${res.accepted} item${res.accepted === 1 ? "" : "s"}.`, { tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="glass elevated rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Sparkles size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Suggested additions</p>
          <p className="text-[11px] text-fg-subtle">
            {suggestions.length > 0
              ? "Read from your filed documents — these need a decision."
              : "Filled in automatically from your documents — review any time."}
          </p>
        </div>
        {suggestions.length > 1 && (
          <button
            type="button"
            onClick={acceptAll}
            disabled={allBusy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition disabled:opacity-50"
          >
            {allBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />} Accept all
          </button>
        )}
      </div>

      <div className="space-y-2">
        {suggestions.map((s) => {
          const isBusy = pending && busy === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-border/70 bg-bg-subtle/40 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Tag kind={s.kind} />
                <p className="text-sm font-medium leading-snug">{s.summary}</p>
              </div>
              {s.detail && <p className="text-[11px] text-fg-subtle pl-0.5">{s.detail}</p>}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => act(s.id, () => acceptSuggestionAction(s.id), "Added.")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 transition disabled:opacity-50"
                >
                  {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Accept
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => act(s.id, () => dismissSuggestionAction(s.id), "Dismissed.")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg transition disabled:opacity-50"
                >
                  <X size={13} /> Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Added automatically — visible + one-click undo (Smart-auto) */}
      {applied.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowApplied((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted hover:text-fg transition"
          >
            <Check size={12} className="text-success" />
            {applied.length} added automatically
            <ChevronDown size={12} className={`transition-transform ${showApplied ? "rotate-180" : ""}`} />
          </button>
          {showApplied && (
            <div className="mt-2 space-y-1">
              {applied.map((s) => {
                const isBusy = pending && busy === s.id;
                return (
                  <div key={s.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-subtle/40">
                    <Tag kind={s.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug">{s.summary}</p>
                      {s.detail && <p className="text-[10px] text-fg-subtle truncate">{s.detail}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => act(s.id, () => undoSuggestionAction(s.id), "Undone.")}
                      className="inline-flex shrink-0 items-center gap-1 text-[10px] text-fg-subtle hover:text-danger transition disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Undo
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
