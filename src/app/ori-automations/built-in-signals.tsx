"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus, Gavel, Activity, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui";
import { useToast } from "@/components/toast";
import { saveSignalSettingsAction } from "./actions";

/** Client-safe "3 days ago" for an ISO/date string (mirrors automation-row.tsx). */
function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? "" : "s"} ago`;
}

export type SignalSettings = {
  quietStaffEnabled: boolean;
  quietStaffDays: number;
  decisionReminderEnabled: boolean;
  decisionReminderDays: number;
  healthDigestEnabled: boolean;
};

export type SignalLastFired = {
  quietStaff: string | null;
  decisionReminder: string | null;
  healthDigest: string | null;
};

/**
 * "Built-in signals" — the three always-on checks wired directly into the ORI
 * automation cron (quiet-staff, decision reminder, weekly health digest). They
 * have no rule row, so this is where the owner sees + pauses them and tunes the
 * thresholds. Optimistic local state; one save action persists to `settings`.
 */
export function BuiltInSignals({ settings, lastFired }: { settings: SignalSettings; lastFired: SignalLastFired }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, start] = useTransition();
  const [s, setS] = useState<SignalSettings>(settings);

  function save(next: SignalSettings) {
    setS(next);
    start(async () => {
      const res = await saveSignalSettingsAction({
        quietStaffEnabled: next.quietStaffEnabled,
        quietStaffDays: next.quietStaffDays,
        decisionReminderEnabled: next.decisionReminderEnabled,
        decisionReminderDays: next.decisionReminderDays,
        healthDigestEnabled: next.healthDigestEnabled,
      });
      if (!res.ok) {
        toast(res.error ?? "Could not save.", { tone: "danger" });
        setS(settings); // revert to server truth
      } else {
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl ring-1 ring-border/60 overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-accent/[0.06] px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">Built-in signals</h2>
          <span className="text-[11px] tabular text-fg-subtle">3</span>
        </div>
        <span className="text-[11px] text-fg-subtle">Always-on checks — switch off or retune any</span>
      </div>
      <ul className="divide-y divide-border/50">
        <SignalRow
          icon={UserMinus}
          title="Quiet staff with open work"
          desc="Staff with open tasks who haven't opened the portal in a while → their manager, plus an owner roll-up."
          lastFired={lastFired.quietStaff}
          enabled={s.quietStaffEnabled}
          onToggle={(v) => save({ ...s, quietStaffEnabled: v })}
          days={s.quietStaffDays}
          onDays={(v) => save({ ...s, quietStaffDays: v })}
          daysLabel="Quiet for"
          saving={saving}
        />
        <SignalRow
          icon={Gavel}
          title="Undecided board decisions"
          desc="Board decisions still open past their due date → the owner, once a day."
          lastFired={lastFired.decisionReminder}
          enabled={s.decisionReminderEnabled}
          onToggle={(v) => save({ ...s, decisionReminderEnabled: v })}
          days={s.decisionReminderDays}
          onDays={(v) => save({ ...s, decisionReminderDays: v })}
          daysLabel="Past due by"
          saving={saving}
        />
        <SignalRow
          icon={Activity}
          title="Weekly health & cost digest"
          desc="A Monday summary of system health, AI usage and open work → the owner (in-app + push)."
          lastFired={lastFired.healthDigest}
          enabled={s.healthDigestEnabled}
          onToggle={(v) => save({ ...s, healthDigestEnabled: v })}
          saving={saving}
        />
      </ul>
    </section>
  );
}

function SignalRow({
  icon: Icon, title, desc, lastFired, enabled, onToggle, days, onDays, daysLabel, saving,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  desc: string;
  lastFired: string | null;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  days?: number;
  onDays?: (v: number) => void;
  daysLabel?: string;
  saving: boolean;
}) {
  return (
    <li className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <span
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-accent ring-1 ring-accent/25"
        style={{ backgroundColor: "color-mix(in srgb, hsl(var(--accent)) 10%, transparent)" }}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-snug text-fg">{title}</div>
        <p className="mt-0.5 text-[11px] leading-snug text-fg-muted">{desc}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[11px] text-fg-subtle">
            Last fired <span className="text-fg-muted">{relTime(lastFired)}</span>
          </span>
          {typeof days === "number" && onDays && daysLabel && (
            <label className={`inline-flex items-center gap-1.5 text-[11px] ${enabled ? "text-fg-muted" : "text-fg-subtle opacity-60"}`}>
              {daysLabel}
              <input
                type="number"
                min={1}
                max={120}
                value={days}
                disabled={!enabled || saving}
                onChange={(e) => onDays(Math.max(1, Math.min(120, Math.round(Number(e.target.value)) || 1)))}
                className="w-14 rounded-md bg-bg-subtle/60 px-2 py-0.5 text-center tabular ring-1 ring-border/60 focus:outline-none focus:ring-accent/40 disabled:opacity-60"
              />
              days
            </label>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        disabled={saving}
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? `Pause ${title}` : `Enable ${title}`}
        className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 disabled:opacity-60"
      >
        {saving ? <Loader2 size={13} className="animate-spin text-fg-subtle" /> : <Switch on={enabled} size="sm" />}
      </button>
    </li>
  );
}
