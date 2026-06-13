"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { friendlyAIError } from "@/lib/ai-errors";

export function CompanySummary({ companyId }: { companyId: number }) {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(friendlyAIError(data.error || `groq-${res.status}`).message);
        return;
      }
      const data = await res.json();
      setSummary(data.summary || "");
    } catch {
      setError(friendlyAIError("network").message);
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent" />
          <span className="font-medium text-sm">AI Executive Briefing</span>
          <span className="text-xs text-fg-muted ml-1">— state of the portfolio for this company</span>
        </div>
        <div className="flex gap-2">
          {summary && (
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
            {loading ? "Analysing…" : summary ? "Regenerate" : "Generate Briefing"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {summary && (
        <div className="bg-bg-subtle border border-border rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {summary}
        </div>
      )}

      {!summary && !error && !loading && (
        <p className="text-xs text-fg-muted italic">
          AI will analyse all open tasks, recent updates, and patterns for this company and produce a 5–7 sentence executive paragraph.
        </p>
      )}
    </div>
  );
}
