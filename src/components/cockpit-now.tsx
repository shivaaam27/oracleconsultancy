import Link from "next/link";
import { Clock, CalendarDays, Plane, Cake, CircleDot, Check } from "lucide-react";
import type { CockpitNowData } from "@/lib/cockpit-now";

function eventTime(iso: string, allDay: boolean): string {
  if (allDay) return "all day";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
}

function Chip({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-2 rounded-full bg-bg-elev/70 px-3 py-1.5 text-xs ring-1 ring-border/50 transition-all hover:-translate-y-0.5 hover:ring-accent/30"
    >
      {icon}
      <span className="whitespace-nowrap">{children}</span>
    </Link>
  );
}

/** Time-aware "right now" strip: today's events, who's on leave, leave to approve,
 *  what's due today, upcoming birthdays. */
export function CockpitNow({ now, dueToday }: { now: CockpitNowData; dueToday: number }) {
  const chips: React.ReactNode[] = [];

  for (const e of now.events) {
    chips.push(
      <Chip key={`e${e.id}`} href="/calendar" icon={<CalendarDays size={13} className="text-fg-muted" />}>
        {e.title} · {eventTime(e.startAt, e.allDay)}
      </Chip>,
    );
  }
  if (dueToday > 0)
    chips.push(
      <Chip key="due" href="/?tab=tasks&flag=due-soon" icon={<CircleDot size={13} className="text-warn" />}>
        {dueToday} due today
      </Chip>,
    );
  if (now.onLeaveToday > 0)
    chips.push(
      <Chip key="leave" href="/hrms/leave" icon={<Plane size={13} className="text-fg-muted" />}>
        {now.onLeaveToday} on leave
      </Chip>,
    );
  if (now.pendingLeave > 0)
    chips.push(
      <Chip key="approve" href="/hrms/leave" icon={<Check size={13} className="text-warn" />}>
        {now.pendingLeave} leave to approve
      </Chip>,
    );
  for (const b of now.birthdays) {
    chips.push(
      <Chip key={`b${b.name}`} href="/people" icon={<Cake size={13} className="text-fg-muted" />}>
        {b.name} · {b.inDays === 0 ? "today" : b.inDays === 1 ? "tomorrow" : `in ${b.inDays}d`}
      </Chip>,
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-accent-soft/30 px-3 py-2.5 ring-1 ring-accent/15 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="inline-flex shrink-0 items-center gap-1.5 pr-1 text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
        <Clock size={12} /> Now
      </span>
      {chips.length > 0 ? (
        chips
      ) : (
        <span className="text-xs text-fg-muted">Clear day — nothing scheduled.</span>
      )}
    </div>
  );
}
