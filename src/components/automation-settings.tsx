"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { AUTOMATION_RULES, MODE_LABEL, type AutomationMode } from "@/lib/automation-rules";
import { setAutomationModeAction, type AutomationRuleStatus } from "@/app/automations/actions";

/** Control room: per-rule Auto / Suggest / Off, with lifetime activity counts. */
export function AutomationSettings({ statuses }: { statuses: AutomationRuleStatus[] }) {
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, AutomationMode>>(
    Object.fromEntries(statuses.map((s) => [s.kind, s.mode]))
  );
  const byKind: Record<string, AutomationRuleStatus> = Object.fromEntries(statuses.map((s) => [s.kind, s]));


  function setMode(kind: string, mode: AutomationMode) {
    setModes((m) => ({ ...m, [kind]: mode }));
    setBusy(kind);
    const was = modes[kind];
    start(async () => {
      const r = await setAutomationModeAction(kind, mode).catch(() => ({ ok: false }));
      // Put the switch back if it didn't save — it used to show the new mode regardless.
      if (!r.ok) { setModes((m) => ({ ...m, [kind]: was })); setFailed(kind); }
      setBusy(null);
    });
  }

  return (
    <div className="space-y-2.5">
      {AUTOMATION_RULES.filter((r) => !r.retired).map((rule) => {
        const mode = modes[rule.kind];
        const st = byKind[rule.kind];
        const opts: AutomationMode[] = rule.supportsSuggest ? ["auto", "suggest", "off"] : ["auto", "off"];
        return (
          <div key={rule.kind} className="rounded-xl border border-border/70 bg-bg-subtle/30 p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{rule.label}</p>
                <p className="text-sm text-fg-muted leading-snug">{rule.description}</p>
                {failed === rule.kind && <p className="mt-1 text-xs text-danger">That didn&apos;t save — try again.</p>}
                {st && (st.applied > 0 || st.suggested > 0) && (
                  <p className="mt-1 text-xs text-fg-subtle">{st.applied} done · {st.suggested} suggested so far</p>
                )}
              </div>
              <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-bg p-0.5 ring-1 ring-border/60">
                {opts.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setMode(rule.kind, o)}
                    disabled={busy === rule.kind}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${mode === o ? "bg-accent text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
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
      <p className="text-xs text-fg-subtle leading-snug">
        <b>Auto</b> — certain matches happen on their own. <b>Suggest</b> — it waits for your one-click approval in the Inbox. <b>Off</b> — it does nothing. Everything it does is logged in the Inbox and can be undone.
      </p>

    </div>
  );
}
