"use client";

/**
 * The three built-in signals (quiet staff, undecided board decisions, the weekly
 * health & cost digest) as Studio cards — the right-hand column of board Ori.
 *
 * They have no rule row: they are wired straight into the ORI cron, so this is
 * where the owner switches them off and tunes the thresholds. One save action
 * (`saveSignalSettingsAction`) writes all five values, as before; the state is
 * optimistic and falls back to the server's on a failure. A threshold is saved
 * when you leave the box (or press Enter), not on every keystroke.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { saveSignalSettingsAction } from "@/app/ori-automations/actions";
import { OriToggle } from "./toggle";

export type SignalSettings = {
  quietStaffEnabled: boolean;
  quietStaffDays: number;
  decisionReminderEnabled: boolean;
  decisionReminderDays: number;
  healthDigestEnabled: boolean;
};

/** Relative "last fired" words, worked out on the server. */
export type SignalLastFired = {
  quietStaff: string | null;
  decisionReminder: string | null;
  healthDigest: string | null;
};

export function OriSignals({ settings, lastFired, className }: { settings: SignalSettings; lastFired: SignalLastFired; className?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, start] = useTransition();
  const [s, setS] = useState<SignalSettings>(settings);

  function save(next: SignalSettings) {
    setS(next);
    start(async () => {
      const res = await saveSignalSettingsAction(next);
      if (!res.ok) {
        toast(res.error ?? "Could not save.", { tone: "danger" });
        setS(settings); // back to the server's truth
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className={cn("grid gap-3 md:grid-cols-3 lg:flex lg:flex-col", className)}>
      <Signal
        title="Quiet staff with open work"
        desc="Staff with open tasks who haven’t opened the portal in a while → their manager, plus a roll-up to you."
        lastFired={lastFired.quietStaff}
        enabled={s.quietStaffEnabled}
        onToggle={(v) => save({ ...s, quietStaffEnabled: v })}
        days={s.quietStaffDays}
        onDays={(v) => save({ ...s, quietStaffDays: v })}
        daysLabel="Quiet for"
        saving={saving}
      />
      <Signal
        title="Undecided board decisions"
        desc="Board decisions still open past their due date → you, once a day."
        lastFired={lastFired.decisionReminder}
        enabled={s.decisionReminderEnabled}
        onToggle={(v) => save({ ...s, decisionReminderEnabled: v })}
        days={s.decisionReminderDays}
        onDays={(v) => save({ ...s, decisionReminderDays: v })}
        daysLabel="Past due by"
        saving={saving}
      />
      <Signal
        title="Weekly health & cost digest"
        desc="A Monday summary of system health, AI use and open work → you (in-app and push)."
        lastFired={lastFired.healthDigest}
        enabled={s.healthDigestEnabled}
        onToggle={(v) => save({ ...s, healthDigestEnabled: v })}
        saving={saving}
        texture
      />
    </div>
  );
}

function Signal({
  title, desc, lastFired, enabled, onToggle, days, onDays, daysLabel, saving, texture,
}: {
  title: string;
  desc: string;
  lastFired: string | null;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  days?: number;
  onDays?: (v: number) => void;
  daysLabel?: string;
  saving: boolean;
  texture?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-[20px] bg-[var(--st-surface)] px-4 py-3.5 lg:min-h-0 lg:flex-1", texture && "st-tex-paper-rings")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-[3px] text-xs leading-[1.45] text-[var(--st-muted)]">{desc}</div>
        </div>
        <OriToggle on={enabled} onChange={onToggle} busy={saving} label={enabled ? `Switch off ${title}` : `Switch on ${title}`} />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2.5 text-xs text-[var(--st-muted)]">
        {typeof days === "number" && onDays && daysLabel && (
          <Threshold key={days} label={daysLabel} value={days} disabled={!enabled || saving} onCommit={onDays} />
        )}
        <span className="flex-1" />
        <span>Last fired {lastFired ?? "—"}</span>
      </div>
    </div>
  );
}

/** "Quiet for [5] days" — typed freely, saved on leaving the box (1–120). */
function Threshold({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Math.max(1, Math.min(120, Math.round(Number(text)) || 1));
    setText(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <label className={cn("flex h-[26px] items-center gap-1 rounded-[7px] bg-[var(--st-page)] px-2.5 text-[var(--st-ink)]", disabled && "opacity-50")}>
      {label}
      <input type="number" min={1} max={120} value={text} disabled={disabled} aria-label={`${label} (days)`}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-8 appearance-none bg-transparent text-center font-medium tabular-nums outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      days
    </label>
  );
}
