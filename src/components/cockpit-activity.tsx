import Link from "next/link";
import { Activity, Sparkles, CircleCheck, MessageSquare, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { CockpitModule } from "@/components/cockpit-module";
import type { ActivityItem } from "@/lib/activity";

/** Compact relative time (re-evaluated each server render → stays fresh on refresh). */
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function CockpitActivity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <CockpitModule
      icon={<Activity size={13} />}
      title={
        <span className="inline-flex items-center gap-2">
          Live activity
          <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
        </span>
      }
    >
      <ul className="mt-2 divide-y divide-border/60">
        {items.map((it) => {
          const Icon = it.isOri ? Sparkles : it.management ? CircleCheck : MessageSquare;
          const tone = it.isOri ? "text-accent" : it.management ? "text-success" : "text-fg-muted";
          return (
            <li key={it.id}>
              <Link
                href={it.code ? `/?tab=tasks&task=${it.code}` : "/?tab=tasks"}
                className="group flex items-center gap-3 py-2.5 transition-colors"
              >
                <Icon size={16} className={cn("shrink-0", tone)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-tight">
                    <span className="font-medium">{it.author}</span>
                    <span className="text-fg-muted"> · {it.body || it.actionItem || "posted an update"}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">
                    {it.code}
                    {it.companyName ? ` · ${it.companyName}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] tabular text-fg-subtle">{ago(it.createdAt)}</span>
                <ChevronRight
                  size={15}
                  className="shrink-0 -translate-x-1 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </CockpitModule>
  );
}
