import { cn } from "@/lib/cn";

type Tone = "muted" | "default" | "warn" | "danger" | "success";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(target: Date): number {
  const a = startOfDay(target).getTime();
  const b = startOfDay(new Date()).getTime();
  return Math.round((a - b) / 86400000);
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * A deadline "has a time" when it isn't stored at UTC midnight. Legacy date-only
 * deadlines are saved as `YYYY-MM-DDT00:00:00Z`, so we treat UTC-midnight as
 * all-day; anything else carries a real clock time the operator chose.
 */
export function hasTime(d: Date): boolean {
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function relativeDeadline(d: Date | null | undefined): {
  text: string;
  tone: Tone;
  title: string;
} {
  if (!d) return { text: "—", tone: "muted", title: "No deadline" };
  const days = diffDays(d);
  const timed = hasTime(d);
  const iso = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    + (timed ? ` ${fmtTime(d)}` : "");
  const t = timed ? ` · ${fmtTime(d)}` : "";

  let text: string, tone: Tone;
  if (days < -1) { text = `${-days}d overdue`; tone = "danger"; }
  else if (days === -1) { text = "Yesterday"; tone = "danger"; }
  else if (days === 0) { text = "Today"; tone = "warn"; }
  else if (days === 1) { text = "Tomorrow"; tone = "warn"; }
  else if (days <= 3) { text = `in ${days}d`; tone = "warn"; }
  else if (days <= 7) { text = d.toLocaleDateString("en-GB", { weekday: "short" }); tone = "default"; }
  else if (days <= 30) { text = fmtShort(d); tone = "default"; }
  else { text = fmtShort(d); tone = "muted"; }

  return { text: text + t, tone, title: iso };
}

const toneClass: Record<Tone, string> = {
  muted: "text-fg-subtle",
  default: "text-fg-muted",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400 font-medium",
  success: "text-emerald-600 dark:text-emerald-400",
};

export function Deadline({
  date,
  className,
  prefix,
}: {
  date: Date | null | undefined;
  className?: string;
  prefix?: string;
}) {
  const r = relativeDeadline(date);
  return (
    <span title={r.title} className={cn("tabular whitespace-nowrap", toneClass[r.tone], className)}>
      {prefix}
      {r.text}
    </span>
  );
}
