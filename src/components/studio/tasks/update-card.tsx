"use client";

/**
 * The right-hand summary card on the Studio Tasks page: how many updates you
 * haven't read, and the updates themselves three at a time, stepped through
 * with ‹ › like the Insights card beside it. A click opens that task in the
 * side panel (task-panel.tsx).
 *
 * It no longer TURNS INTO the picked task (owner, 25 Sept 2026): it sits at the
 * top of the page, so a row picked further down had its updates off-screen.
 * The side panel stays in view wherever you have scrolled.
 */
import Link from "next/link";
import { PersonFace } from "@/components/studio/face";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskRow } from "@/lib/tasks/queries";
import { CardHead, Dot } from "@/components/studio/kit";
import { useStudioPick } from "./pick";
import { ago } from "./task-words";
import { cn } from "@/lib/cn";

export function UpdateCard({
  fresh,
  unreadCount,
  postedToday,
  hrefs,
  title,
}: {
  /** Staff (26 Sept 2026): an update opens the task page rather than a side
   *  panel — code → address (a map, since a function cannot come from the server). */
  hrefs?: Record<string, string>;
  title?: string;
  /** Unread updates newest first (or, when nothing is unread, the latest few). */
  fresh: TaskRow[];
  unreadCount: number;
  postedToday: number;
}) {
  const pick = useStudioPick();
  return (
    <div className="st-tex-rings relative flex min-w-0 flex-col overflow-hidden rounded-[20px] bg-[var(--st-card)] px-[18px] py-4 text-[var(--st-on-card)] sm:px-6 sm:py-5 md:min-h-[244px]">
      <Idle fresh={fresh} unreadCount={unreadCount} postedToday={postedToday} picked={pick?.code ?? null} onPick={(c) => pick?.setCode(c)} hrefs={hrefs} title={title} />
    </div>
  );
}


function Idle({ fresh, unreadCount, postedToday, picked, onPick, hrefs, title }: { fresh: TaskRow[]; unreadCount: number; postedToday: number; picked: string | null; onPick: (code: string) => void; hrefs?: Record<string, string>; title?: string }) {
  const PER_PAGE = useMediaQuery("(max-width: 639px)") ? 2 : 3;
  const pages = Math.max(1, Math.ceil(fresh.length / PER_PAGE));
  const [page, setPage] = useState(0);
  const at = Math.min(page, pages - 1); // the list can shrink as updates are read
  const shown = fresh.slice(at * PER_PAGE, at * PER_PAGE + PER_PAGE);
  const step = (d: number) => setPage((n) => (Math.min(n, pages - 1) + d + pages) % pages);
  const ARROW = "flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-[var(--st-card-line)] text-[#C9CBCF] hover:bg-[var(--st-card-2)]";
  return (
    <div className="st-pop flex h-full flex-1 flex-col">
      <CardHead
        label={title ?? (unreadCount > 0 ? "Unread updates" : "Latest updates")}
        right={pages > 1 ? (
          <span className="flex items-center gap-1.5">
            <span className="tabular-nums">{at + 1} of {pages}</span>
            <button type="button" aria-label="Previous updates" onClick={() => step(-1)} className={cn(ARROW, "ml-1")}><ChevronLeft size={12} /></button>
            <button type="button" aria-label="More updates" onClick={() => step(1)} className={ARROW}><ChevronRight size={12} /></button>
          </span>
        ) : <span>Click one to read and reply</span>}
      />
      {/* Phone: the number and its words on one line, two updates a page —
          the card matches its neighbour's height (owner, 25 Sept 2026). */}
      <div className="mt-2.5 grid flex-1 grid-cols-1 items-end gap-3 sm:mt-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-5">
        <div className="max-sm:flex max-sm:items-end max-sm:gap-3">
          <div className="text-[52px] leading-[0.85] tracking-[-0.045em] tabular-nums sm:text-[76px]">{unreadCount}</div>
          <div>
          <div className="text-[13px] text-[#C9CBCF] sm:mt-2.5">unread {unreadCount === 1 ? "update" : "updates"}</div>
          <div className="mt-0.5 text-xs text-[var(--st-muted)]">{postedToday === 0 ? "No task updated yet today" : `${postedToday} ${postedToday === 1 ? "task" : "tasks"} updated today`}</div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {fresh.length === 0 && <div className="text-[13px] text-[var(--st-muted)]">No updates yet on the open tasks.</div>}
          {shown.map((r) => {
            const a = r.latestActivity!;
            const to = hrefs?.[r.code];
            const Row = to ? Link : "button";
            return (
              <Row
                key={r.code}
                href={to as string}
                {...(to ? {} : { type: "button" as const, onClick: () => onPick(r.code), "aria-pressed": picked === r.code })}
                className={cn("grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border bg-[rgba(20,21,23,0.85)] px-2.5 py-2 text-left transition-colors hover:border-[#3A3D42]", picked === r.code ? "border-[#5A5D63]" : "border-[var(--st-card-line)]")}
              >
                {/* Your own update wears your face too (the owner's), "You" under it. */}
                <PersonFace name={a.author === "You" ? "Administrator" : a.author} label={a.author === "You" ? "You" : undefined} size={24} peek />
                <span className="min-w-0">
                  <span className="block truncate text-xs text-[var(--st-on-card-muted)]">{r.actionItem}</span>
                  <span className="block truncate text-[13px]">{a.body}</span>
                </span>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[var(--st-muted)]">
                  {r.unread && <Dot color="var(--st-blue)" size={6} />}
                  {ago(a.atISO)}
                </span>
              </Row>
            );
          })}
        </div>
      </div>
    </div>
  );
}
