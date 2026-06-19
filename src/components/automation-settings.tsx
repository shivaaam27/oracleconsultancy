"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { AUTOMATION_RULES, MODE_LABEL, type AutomationMode } from "@/lib/automation-rules";
import { setAutomationModeAction, setRecordsConfidenceAction, type AutomationRuleStatus } from "@/app/automations/actions";

/** Control room: per-rule Auto / Suggest / Off, with lifetime activity counts. */
export function AutomationSettings({ statuses, recordsConfidence = 0 }: { statuses: AutomationRuleStatus[]; recordsConfidence?: number }) {
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, AutomationMode>>(
    Object.fromEntries(statuses.map((s) => [s.kind, s.mode]))
  );
  const [conf, setConf] = useState(recordsConfidence);
  const byKind: Record<string, AutomationRuleStatus> = Object.fromEntries(statuses.map((s) => [s.kind, s]));

  function saveConf(v: number) {
    setConf(v);
    start(async () => { await setRecordsConfidenceAction(v); });
  }

  function setMode(kind: string, mode: AutomationMode) {
    setModes((m) => ({ ...m, [kind]: mode }));
    setBusy(kind);
    start(async () => { await setAutomationModeAction(kind, mode); setBusy(null); });
  }

  return (
    <div className="space-y-2.5">
      {AUTOMATION_RULES.map((rule) => {
        const mode = modes[rule.kind];
        const st = byKind[rule.kind];
        const opts: AutomationMode[] = rule.supportsSuggest ? ["auto", "suggest", "off"] : ["auto", "off"];
        return (
          <div key={rule.kind} className="rounded-xl border border-border/70 bg-bg-subtle/30 p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{rule.label}</p>
                <p className="text-[12px] text-fg-muted leading-snug">{rule.description}</p>
                {st && (st.applied > 0 || st.suggested > 0) && (
                  <p className="mt-1 text-[11px] text-fg-subtle">{st.applied} done · {st.suggested} suggested so far</p>
                )}
              </div>
              <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-bg p-0.5 ring-1 ring-border/60">
                {opts.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setMode(rule.kind, o)}
                    disabled={busy === rule.kind}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 ${mode === o ? "bg-accent text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
                  >
                    {busy === rule.kind && mode === o && <Loader2 size={10} className="animate-spin" />}
                    {MODE_LABEL[o]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-fg-subtle leading-snug">
        <b>Auto</b> — certain matches happen on their own. <b>Suggest</b> — it waits for your one-click approval in the Inbox. <b>Off</b> — it does nothing. Everything it does is logged in the Inbox and can be undone.
      </p>

      {/* Phase 6 — confidence threshold for auto-filling records. */}
      <div className="rounded-xl border border-border/70 bg-bg-subtle/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug">Auto-fill confidence</p>
            <p className="text-[12px] text-fg-muted leading-snug">
              {conf === 0
                ? "A clean read is enough to fill records automatically."
                : `Only auto-fill records when the scan is at least ${conf}% confident — otherwise propose it.`}
            </p>
          </div>
          <span className="shrink-0 tabular text-sm font-semibold text-accent">{conf === 0 ? "Off" : `${conf}%`}</span>
        </div>
        <input
          type="range" min={0} max={100} step={5} value={conf}
          onChange={(e) => setConf(parseInt(e.target.value, 10))}
          onMouseUp={(e) => saveConf(parseInt((e.target as HTMLInputElement).value, 10))}
          onTouchEnd={(e) => saveConf(parseInt((e.target as HTMLInputElement).value, 10))}
          className="mt-2 w-full accent-accent"
        />
      </div>
    </div>
  );
}
