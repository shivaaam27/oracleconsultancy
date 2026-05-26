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

export function relativeDeadline(d: Date | null | undefined): {
  text: string;
  tone: Tone;
  title: string;
} {
  if (!d) return { text: "—", tone: "muted", title: "No deadline" };
  const days = diffDays(d);
  const iso = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  if (days < -1) return { text: `${-days}d overdue`, tone: "danger", title: iso };
  if (days === -1) return { text: "Yesterday", tone: "danger", title: iso };
  if (days === 0) return { text: "Today", tone: "warn", title: iso };
  if (days === 1) return { text: "Tomorrow", tone: "warn", title: iso };
  if (days <= 3) return { text: `in ${days}d`, tone: "warn", title: iso };
  if (days <= 7) {
    const weekday = d.toLocaleDateString("en-GB", { weekday: "short" });
    return { text: weekday, tone: "default", title: iso };
  }
  if (days <= 30) return { text: fmtShort(d), tone: "default", title: iso };
  return { text: fmtShort(d), tone: "muted", title: iso };
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
