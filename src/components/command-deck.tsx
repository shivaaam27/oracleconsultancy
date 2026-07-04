"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  Check,
  FileText,
  KanbanSquare,
  ListChecks,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { CompanyAvatar } from "@/components/company-avatar";

/* The Command Centre "deck" — the unified home's working surfaces
 * (memory/command_centre_unification.md):
 *   • NeedsYou      — worst-first open tasks, scroll-housed; swipe left = Remind
 *   • CompanyHeat   — ALL companies as logo heat tiles (portal HealthTile twin),
 *                     worst-first, scroll-housed to match NeedsYou's height
 *   • CommandRooms  — the live rooms of the house; a tile pulses when its
 *                     number changed since you last looked (reduced-motion safe)
 * Client component: swipe + pulse need state; everything else is plain links. */

/* ---------------------------------- Needs you ---------------------------------- */

export type NeedsYouItem = {
  code: string;
  title: string;
  /** "Oracle Consultancy Ltd · Mr Shivam Parmar" */
  meta: string;
  /** "21d" | "in 2d" | "today" */
  badge: string;
  tone: "danger" | "warn";
};

/** One swipeable task row — swipe left to reveal Remind (opens the live Outbox,
 *  which drafts the chase message per person); tap opens the task drawer. */
function NeedsYouRow({ t }: { t: NeedsYouItem }) {
  const router = useRouter();
  const { swiped, offset, dragging, bind, reset } = useSwipeRow({ rightWidth: 96 });
  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* Right tray — revealed by a left swipe (kept out of the DOM until the
          gesture starts, so it can't ghost through the translucent card). */}
      <div className={cn("absolute inset-y-0 right-0 flex w-24 items-stretch", offset === 0 && !swiped && "hidden")}>
        <button
          type="button"
          onClick={() => {
            reset();
            router.push("/outbox");
          }}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-warn-soft/70 text-[11px] font-semibold text-warn"
        >
          <BellRing size={15} />
          Remind
        </button>
      </div>
      <div
        {...bind}
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)" }}
        className="relative touch-pan-y"
      >
        <Link
          href={`/?tab=tasks&task=${encodeURIComponent(t.code)}`}
          onClick={(e) => {
            if (swiped) {
              e.preventDefault();
              reset();
            }
          }}
          className="group block rounded-2xl bg-bg-elev/55 px-3.5 py-2.5 ring-1 ring-border/70 transition-all hover:-translate-y-0.5 hover:ring-accent/30"
        >
          <span className="flex items-center gap-2.5">
            <span className="shrink-0 rounded-md bg-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular text-fg-muted ring-1 ring-border/60">
              {t.code}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg group-hover:text-accent">{t.title}</span>
            <span className={cn("shrink-0 text-xs font-bold tabular", t.tone === "danger" ? "text-danger" : "text-warn")}>
              {t.badge}
            </span>
          </span>
          <span className="mt-1 block truncate pl-[3px] text-[11px] text-fg-subtle">{t.meta}</span>
        </Link>
      </div>
    </li>
  );
}

export function NeedsYou({ items, totalOverdue }: { items: NeedsYouItem[]; totalOverdue: number }) {
  return (
    <div className="flex flex-col rounded-3xl glass p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">Needs you</p>
        {totalOverdue > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft/60 px-2 py-0.5 text-[10px] font-semibold text-danger ring-1 ring-danger/20">
            <AlertOctagon size={10} /> {totalOverdue}
          </span>
        )}
        <Link href="/?tab=tasks" className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-accent">
          All tasks <ArrowUpRight size={12} />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-bg-elev/50 px-4 py-6 text-center text-sm text-fg-muted ring-1 ring-border/60">
          Nothing needs you — the desk is clear.
        </p>
      ) : (
        <div className="scroll-fade-y mt-3 -mx-1 max-h-[27rem] flex-1 overflow-y-auto overscroll-contain px-1 slim-scroll">
          <ul className="space-y-2">
            {items.map((t) => (
              <NeedsYouRow key={t.code} t={t} />
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2.5 text-center text-[10px] text-fg-subtle">worst first · tap to open · swipe left to remind</p>
    </div>
  );
}

/* -------------------------------- Company heat --------------------------------- */

export type HeatTile = {
  companyId: number;
  name: string;
  logoUrl: string | null;
  accent: string | null;
  open: number;
  overdue: number;
  /** "worst: 21d late" | "due in 2d" | "3 open · on track" | "No open tasks" */
  note: string;
  tone: "danger" | "warn" | "success";
};

const HEAT_TONE = {
  danger: "bg-danger-soft/50 ring-danger/20 hover:ring-danger/40",
  warn: "bg-warn-soft/50 ring-warn/25 hover:ring-warn/45",
  success: "bg-success-soft/40 ring-success/20 hover:ring-success/40",
} as const;
const HEAT_TEXT = { danger: "text-danger", warn: "text-warn", success: "text-success" } as const;

export function CompanyHeat({ tiles }: { tiles: HeatTile[] }) {
  return (
    <div className="flex flex-col rounded-3xl glass p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">Company health</p>
        <Link href="/?tab=companies" className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-accent">
          Companies <ArrowUpRight size={12} />
        </Link>
      </div>
      {/* All companies, worst-first — housed + scrolls within, matching the
          Needs-you column's height (the portal board's HealthPanel pattern). */}
      <div className="scroll-fade-y mt-3 -mx-1 max-h-[27rem] flex-1 overflow-y-auto overscroll-contain px-1 slim-scroll">
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((c) => (
            <Link
              key={c.companyId}
              href={`/companies/${c.companyId}`}
              className={cn(
                "group relative flex flex-col rounded-2xl p-3 ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]",
                HEAT_TONE[c.tone],
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <CompanyAvatar name={c.name} accent={c.accent} logoUrl={c.logoUrl} size={28} rounded="rounded-lg" iconSize={13} />
                {c.overdue > 0 ? (
                  <span className={cn("text-lg font-bold leading-none tabular", HEAT_TEXT[c.tone])}>{c.overdue}</span>
                ) : (
                  <Check size={16} className="text-success" strokeWidth={2.5} />
                )}
              </div>
              <p className="mt-2 truncate text-[12.5px] font-semibold">{c.name}</p>
              <p className={cn("mt-0.5 truncate text-[10.5px]", c.overdue > 0 || c.tone === "warn" ? HEAT_TEXT[c.tone] : "text-fg-subtle")}>
                {c.note}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------- Rooms ------------------------------------- */

export type Room = {
  key: string;
  label: string;
  count: number;
  /** Small suffix beside the count, e.g. "· 10 late". */
  suffix?: string;
  /** The room's last heartbeat — one quiet line of life. */
  heartbeat: string;
  href: string;
  tone: "danger" | "warn" | "success";
};

const ROOM_ICON: Record<string, React.ReactNode> = {
  tasks: <ListChecks size={13} />,
  approvals: <ShieldCheck size={13} />,
  people: <Users size={13} />,
  calendar: <CalendarDays size={13} />,
  documents: <FileText size={13} />,
  pipeline: <KanbanSquare size={13} />,
};

const ROOM_DOT = {
  danger: "bg-danger",
  warn: "bg-warn",
  success: "bg-success",
} as const;

/** One live room tile. Pulses (soft accent ring, motion-safe) when its count
 *  differs from the last value this browser saw — live sync made visible. */
function RoomTile({ r }: { r: Room }) {
  const [pulse, setPulse] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    try {
      const k = `cos-room-${r.key}`;
      const prev = sessionStorage.getItem(k);
      sessionStorage.setItem(k, String(r.count));
      if (prev !== null && Number(prev) !== r.count) {
        setPulse(true);
        const t = setTimeout(() => setPulse(false), 2400);
        return () => clearTimeout(t);
      }
    } catch {
      /* storage unavailable — no pulse */
    }
  }, [r.key, r.count]);

  return (
    <Link
      href={r.href}
      className={cn(
        "group relative rounded-2xl bg-bg-subtle/50 p-3 ring-1 transition-all hover:-translate-y-0.5 hover:ring-accent/30",
        pulse ? "ring-accent/50 shadow-[0_0_0_3px_hsl(var(--accent)/0.12)]" : "ring-border/60",
      )}
    >
      <span
        className={cn(
          "absolute right-3 top-3 h-1.5 w-1.5 rounded-full",
          ROOM_DOT[r.tone],
          pulse && "motion-safe:animate-ping",
        )}
        aria-hidden
      />
      <span className={cn("absolute right-3 top-3 h-1.5 w-1.5 rounded-full", ROOM_DOT[r.tone])} aria-hidden />
      <span className="text-xl font-bold leading-none tracking-tight tabular text-fg group-hover:text-accent">
        {r.count}
        {r.suffix && <em className="ml-1 align-middle text-[10px] font-semibold not-italic text-danger">{r.suffix}</em>}
      </span>
      <span className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
        <span className="text-fg-subtle">{ROOM_ICON[r.key]}</span> {r.label}
      </span>
      <span className="mt-2 block truncate border-t border-dashed border-border/60 pt-1.5 text-[10px] text-fg-subtle">
        {r.heartbeat}
      </span>
    </Link>
  );
}

export function CommandRooms({ rooms }: { rooms: Room[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      {rooms.map((r) => (
        <RoomTile key={r.key} r={r} />
      ))}
    </div>
  );
}
