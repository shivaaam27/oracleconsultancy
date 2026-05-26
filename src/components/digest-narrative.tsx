"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";

type Stats = {
  overdue: { code: string; company: string; action: string; daysLate?: number; assignees: string[] }[];
  escalated: { code: string; company: string; action: string; latestUpdate?: string }[];
  critical: { code: string; company: string; action: string; deadline?: string }[];
  dueSoon: { code: string; company: string; action: string; deadline?: string }[];
  recentlyClosed: { code: string; company: string; action: string }[];
  totalOpen: number;
  companies: { name: string; open: number; overdue: number; critical: number; escalated: number; completed: number }[];
};

export function DigestNarrative({ stats }: { stats: Stats }) {
  const [narrative, setNarrative] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/digest-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats }),
      });
      const data = await res.json();
      if (data.result) {
        setNarrative(data.result);
      } else {
        setError(data.source === "no-key" ? "AI key not configured." : "Could not generate narrative.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(narrative);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent" />
          <span className="font-medium text-sm">Executive Narrative</span>
          <span className="text-xs text-fg-muted ml-1">— AI-written summary you can forward</span>
        </div>
        <div className="flex gap-2">
          {narrative && (
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg px-3 py-1.5 transition-colors"
            >
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {loading ? "Writing…" : narrative ? "Regenerate" : "Generate Narrative"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {narrative && (
        <div className="bg-bg-subtle border border-border rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {narrative}
        </div>
      )}

      {!narrative && !error && !loading && (
        <p className="text-xs text-fg-muted italic">
          Click <strong>Generate Narrative</strong> to have AI write a 4–6 sentence executive briefing from this week's data.
        </p>
      )}
    </div>
  );
}
