"use client";

import { useEffect, useState, useTransition } from "react";
import { Activity, ChevronDown, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { getExtractionHealthAction, type ExtractionHealth } from "@/app/documents/actions";

// Plain-language labels for each skip/fail reason the reader records, so the
// owner sees WHY a file didn't read rather than a code.
const REASON_LABEL: Record<string, string> = {
  "no-key": "AI was switched off",
  heic: "iPhone HEIC photo (needs JPEG/PNG)",
  "too-big": "Image too large",
  unreadable: "Couldn't read the scan",
  unsupported: "Unsupported file type",
  "low-confidence": "Scan was unclear",
};

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? (reason === "ok" ? "Read cleanly" : reason);
}

// A small relative-time formatter (same style as the notifications bell).
function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Status → dot colour: ok green, skip/needs-review amber, anything else red.
function dotClass(status: string): string {
  if (status === "ok") return "bg-success";
  if (status === "skip") return "bg-warn";
  return "bg-danger";
}

/**
 * "AI reading health" — a quiet, collapsible diagnostics card on the Documents
 * page so the owner can SEE why document reads fail or need a look (AI switched
 * off, HEIC photo, unclear scan…) instead of guessing. Loads a summary of the
 * last ~200 reads on mount; renders nothing until there is something to show.
 */
export function ExtractionHealth({ className = "" }: { className?: string }) {
  const [health, setHealth] = useState<ExtractionHealth | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [pending, start] = useTransition();

  function load() {
    start(async () => {
      const h = await getExtractionHealthAction();
      setHealth(h);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Still loading the first read, or nothing recorded yet — stay out of the way.
  if (!health) return null;
  if (health.total === 0) {
    return (
      <details className={`group glass rounded-2xl overflow-hidden ${className}`}>
        <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 select-none">
          <Activity size={15} className="text-fg-subtle shrink-0" />
          <span className="text-sm font-medium text-fg-muted">AI reading health</span>
          <span className="ml-auto text-xs text-fg-subtle">No document reads yet.</span>
        </summary>
      </details>
    );
  }

  const { total, ok, needsReview, failed, byReason, recent } = health;

  return (
    <details className={`group glass rounded-2xl overflow-hidden ${className}`}>
      <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 select-none">
        <Activity size={15} className="text-accent shrink-0" />
        <span className="text-sm font-semibold">AI reading health</span>
        <span className="ml-auto text-xs text-fg-muted truncate">
          Last {total} read{total === 1 ? "" : "s"}: {ok} read cleanly · {needsReview} needed a look · {failed} couldn&apos;t be read
        </span>
        <ChevronDown size={15} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-border/60 p-3.5 space-y-3">
        {/* Reason breakdown as friendly chips. */}
        {byReason.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {byReason.map((r) => (
              <span
                key={r.reason}
                className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-2.5 py-1 text-[11px] text-fg-muted ring-1 ring-border/60"
              >
                {reasonLabel(r.reason)}
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-bg-muted text-fg text-[10px] font-semibold tabular">
                  {r.count}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-fg-muted">Every recent read came through cleanly.</p>
        )}

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="xs" onClick={load} disabled={pending}>
            {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
          </Button>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRecent((v) => !v)}
              className="text-xs text-fg-muted hover:text-accent transition-colors"
            >
              {showRecent ? "Hide recent reads" : `Show recent reads (${recent.length})`}
            </button>
          )}
        </div>

        {/* Recent reads — newest first. */}
        {showRecent && recent.length > 0 && (
          <ul className="rounded-xl ring-1 ring-border/60 divide-y divide-border/50 overflow-hidden">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center gap-2.5 px-3 py-2 bg-bg-elev/40">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass(r.status)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium truncate">{r.file}</span>
                  <span className="block text-[10px] text-fg-muted truncate">
                    {reasonLabel(r.reason)}
                    {r.confidence != null ? ` · ${Math.round(r.confidence * 100)}% sure` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-fg-subtle tabular">{ago(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
