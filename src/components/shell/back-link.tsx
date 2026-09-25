"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { canStepBack, clearPush, markPush, returnLabel, safeReturn, withReturn } from "@/lib/nav/return-to";

/**
 * The way out of a record.
 *
 * A record page is opened from a list, and the list's filters, search and place
 * in the page ARE its state. A back link hard-coded to `/portal/tasks` throws
 * all of it away: a director who tapped a task on his Board was returned to a
 * Tasks list he had never opened, unfiltered, at the top. Measured live on
 * 20 Sept 2026 — `?f=done&q=tra` at 758px became `/portal/tasks` at 0px.
 *
 * So the row link carries where it came from (`RecordList` does this for every
 * converted list) and this reads it back. No return address — a bookmark, a
 * notification, a link in chat — and it falls back to the page's own sensible
 * default, which is exactly what it did before.
 *
 * ⚠️ IT REPLACES, IT DOES NOT PUSH. A back link that pushes leaves the record in
 * the history, so the browser's own Back button then goes FORWARD into the task
 * you just left — the loop the owner reported ("he has to start afresh"). Each
 * trip through a record used to add two entries. Replacing means Back from the
 * list goes where it always should: the page before the record.
 *
 * ⚠️ `safeReturn` is what stops a crafted `?back=` pointing the button off-site.
 */
export function BackLink({
  fallbackHref,
  fallbackLabel,
  className,
}: {
  /** Where to go when nothing told us where we came from. */
  fallbackHref: string;
  /** What to call that fallback. */
  fallbackLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const back = safeReturn(params.get("back"));
  const href = back ?? fallbackHref;
  const label = back ? returnLabel(back) : fallbackLabel;

  return (
    <Link
      href={href}
      onClick={(e) => {
        // A plain click replaces; ⌘/Ctrl/middle-click still opens a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        /* A real history step where it provably IS one: that is the only way
         * the browser gives the scroll position back, and it is what puts a
         * page which is not a `RecordList` — the activity feed, a panel on a
         * profile — back where you were reading. Otherwise replace, which
         * always lands on the right page even if it lands at the top. */
        if (canStepBack()) { clearPush(); router.back(); return; }
        router.replace(href);
      }}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg",
        className
      )}
    >
      <ArrowLeft size={15} /> {label}
    </Link>
  );
}

/**
 * A link INTO a record that says where it was clicked from.
 *
 * `RecordList` does this for every converted list. This is for the places that
 * are not a list — a feed, a board card, a search result, a panel on someone's
 * profile — so that wherever a record is opened from, the way out of it leads
 * back there. Same rule, same helper.
 */
export function ReturnLink({
  href,
  children,
  className,
  title,
  onClick,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
} & Omit<React.ComponentProps<typeof Link>, "href" | "children" | "className" | "title">) {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  const to = withReturn(href, `${pathname}${qs ? `?${qs}` : ""}`);
  return (
    <Link
      href={to}
      /* ⚠️ COMPOSE THE CALLER'S onClick, NEVER LET THE SPREAD SWALLOW OURS.
         `{...rest}` last meant a caller that closes a panel on click quietly
         replaced this handler, so the link carried a return address that the
         back button could then never step to — right page, lost scroll, and
         nothing on screen to say why. The caller goes FIRST, and a click it
         cancels (a swipe in progress) leaves no mark for a journey that never
         happened. */
      onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) markPush(to); }}
      className={className}
      title={title}
      {...rest}
    >
      {children}
    </Link>
  );
}
