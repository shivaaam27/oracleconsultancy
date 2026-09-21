"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Your place in a list.
 *
 * Getting the ADDRESS right on the way back (see `lib/return-to.ts`) restores
 * the filter and the search, and a real history step restores the window's
 * scroll. Neither of those can restore a SCROLL HOUSING.
 *
 * ⚠️ A SCROLL HOUSING IS BEYOND BOTH THE BROWSER AND NEXT. The board's two
 * columns and the staff home task list are their own `overflow-y: auto` panels.
 * Scroll restoration works on the window; a div's scrollTop is nobody's job, so
 * a director who scrolled his "Needs you" column, opened a task and came back
 * was always returned to the top of it.
 *
 * So this remembers the ROW, not an offset: which record was opened, for ten
 * minutes. On the way back the row is scrolled into view — through every
 * scrolling ancestor, which is what `scrollIntoView` does and a pixel offset
 * cannot — and marked briefly so the eye finds it without reading.
 *
 * It does nothing when the row is already in front of you, so it never fights
 * the browser's own restoration: whichever of them is right, wins.
 */

const PREFIX = "cos.listPlace:";
/** Long enough to open a record, read it and come back; short enough that
 *  returning to a list tomorrow is a plain list, not a haunted one. */
const TTL_MS = 10 * 60 * 1000;
/** How long the row stays marked. Long enough to find, short enough to ignore. */
const MARK_MS = 1600;
/** How often to look while the page is still settling, and for how long. */
const WATCH_EVERY_MS = 100;
/* ⚠️ LONG ENOUGH FOR THE LIST TO ARRIVE. A 195-row list on a cold render is
 * still drawing well past two seconds, and the watch expiring first is not a
 * failure you can see — the page simply stays where it was. It only ever moves
 * a row that is out of view, and any scroll, touch or key from the reader ends
 * it immediately, so a longer window costs nothing on a page that is ready. */
const WATCH_FOR_MS = 4000;
/** In view this many checks running = the page has stopped moving. */
const STABLE_CHECKS = 3;
/** Attempts before giving up and putting the page back as it was. */
const MAX_MOVES = 4;
/** Give scroll restoration — the browser's and Next's — time to land first. */
const SETTLE_FIRST_MS = 400;

/**
 * ⚠️ READ IT, BUT TAKE IT AWAY ONLY WHEN A ROW ACTUALLY MATCHES.
 *
 * Both halves of that were paid for. Consuming it on MOUNT breaks a page with
 * two lists on it — the board has "Needs you" and "Company health", neither
 * sets a `listKey`, so both key off the pathname and whichever mounted first
 * swallowed the other's place. And never consuming it breaks the single list,
 * because a list can mount more than once on the way back and a `useRef` guard
 * is no guard across mounts: measured, four placements in one return, the last
 * of them wrong.
 */
function readPlace(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { k, t } = JSON.parse(raw) as { k?: string; t?: number };
    if (!k || typeof t !== "number" || Date.now() - t > TTL_MS) return null;
    return k;
  } catch {
    return null;
  }
}

function forgetPlace(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * ⚠️ ONE LIST GETS TO PLACE THE PAGE, AND A `listKey` DOES NOT GUARANTEE ONE
 * LIST.
 *
 * `/hrms/assets` renders the Assets list TWICE — the same `listKey: "asset"`
 * on both — and both instances matched the remembered row and started moving
 * the window to their own copy of it, in turn, until the watch expired. The
 * page ended up 2,944px from where it should have been.
 *
 * So the claim is held HERE, outside any one instance: the first to find the
 * row keeps it until it is done, and the others stand down. A page-level lock,
 * because the thing being fought over — the scroll position — is page-level.
 */
const claimed = new Set<string>();

/** A copy that is not being rendered cannot be scrolled to, and must not take
 *  the claim from the one that can. */
function isRendered(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  return box.height > 0 && box.width > 0;
}

const SCROLLS = /(auto|scroll|overlay)/;

/**
 * Is the row actually in front of you?
 *
 * ⚠️ THE WINDOW IS NOT THE ONLY THING THAT CAN HIDE IT. A row scrolled out of a
 * board column has a rectangle that still sits inside the window — the column
 * clipped it, not the viewport — so a window-only test reports it visible and
 * leaves you looking at the wrong end of the list. Every scrolling ancestor has
 * to agree.
 */
function inFullView(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  if (box.top < 0 || box.bottom > (window.innerHeight || 0)) return false;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (!SCROLLS.test(style.overflowY) && !SCROLLS.test(style.overflowX)) continue;
    const bounds = p.getBoundingClientRect();
    if (box.top < bounds.top || box.bottom > bounds.bottom) return false;
  }
  return true;
}

export function useListPlace(key: string | null) {
  /* Read once, on mount — the value is only interesting on the render that
   * follows a return. */
  const [wanted, setWanted] = useState<string | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  const started = useRef(false);
  const placed = useRef(false);

  useEffect(() => {
    if (started.current || !key) return;
    started.current = true;
    setWanted(readPlace(key));
  }, [key]);

  /** Call as a row is opened. */
  const remember = useCallback(
    (rowKey: string | number) => {
      if (!key) return;
      try {
        sessionStorage.setItem(PREFIX + key, JSON.stringify({ k: String(rowKey), t: Date.now() }));
      } catch {
        /* private mode, blocked storage — losing your place is not an error */
      }
    },
    [key]
  );

  /* The LIVE element for the row we are looking for. ⚠️ A REF, NOT A CAPTURED
   * NODE: React replaces a row's element as the list re-renders, and a watcher
   * holding the first one saw `isConnected` go false and gave up silently —
   * which is exactly why the fix worked on /portal/tasks and did nothing at
   * all on /hrms/assets. Every render re-points this; the watcher reads it
   * fresh on each look. */
  const live = useRef<HTMLElement | null>(null);
  /* ⚠️ AND THE KEY IT IS LOOKING FOR LIVES IN A REF TOO. `wanted` is cleared
   * the moment watching starts — it has to be, or the mark never clears — so
   * an `attach` that tested the STATE stopped matching on the very next
   * render, `live` was left holding a detached node, and the watcher sat there
   * politely waiting for an element that would never reconnect. That is why
   * the row was marked correctly and then not scrolled to. */
  const hunting = useRef<string | null>(null);

  /* The row that matched hands us its element; we put it on screen and mark it. */
  const attach = useCallback(
    (el: HTMLElement | null, rowKey: string | number) => {
      const want = hunting.current ?? wanted;
      if (!el || !want || String(rowKey) !== want) return;
      if (!isRendered(el)) return;
      const lock = `${key ?? ""}:${want}`;
      if (!placed.current && claimed.has(lock)) return; // another copy has it
      live.current = el;
      if (placed.current) return;
      placed.current = true;
      claimed.add(lock);
      hunting.current = want;
      // The journey is over the moment its row is found again.
      if (key) forgetPlace(key);

      /* ⚠️ AND IT STOPS THE MOMENT HE TAKES OVER. Dragging somebody back to a
       * row they have just scrolled away from is worse than never moving. */
      let cancelled = false;
      const stop = () => { cancelled = true; };
      const opts = { passive: true, once: true } as const;
      window.addEventListener("wheel", stop, opts);
      window.addEventListener("touchstart", stop, opts);
      window.addEventListener("keydown", stop, opts);

      /* ⚠️ A FIXED SET OF TIMED PASSES CANNOT TRACK A LIST THAT IS STILL
       * RENDERING, and two of them are worse than one. Measured on
       * /hrms/assets — 195 rows — the row sat at 1008px, then 2721px, then
       * -1923px on three successive passes, each placement chasing the last
       * and the final one left 2,930px past it. The page keeps moving because
       * content above it is still arriving.
       *
       * So watch instead of guess: look every 100ms, move ONLY while the row
       * is out of view, and stop once it has stayed put for three checks
       * running or the window closes. A settled page costs three no-ops. */
      let settled = 0;
      let poll = 0;
      /* ⚠️ AND IT GIVES UP RATHER THAN JITTERS. Watching is only safe if it is
       * bounded: the one time two lists fought over the same remembered row,
       * this loop moved the window between two positions every 100ms until the
       * window closed. A handful of moves is all a settling page needs, and if
       * they have not worked the honest answer is to put the page back where
       * it was and leave it alone. */
      const startY = window.scrollY;
      let moves = 0;
      /* ⚠️ A MOVE ONLY COUNTS AGAINST THE BUDGET ONCE THE ROW HAS STOPPED
       * MOVING. A 585-row list is still rendering for the first half second,
       * and the row's position in the document shifts with it — so counting
       * those as failed attempts spent the whole budget on a page that had not
       * finished drawing, and the safety net then put it back at the top. What
       * we are guarding against is trying and getting nowhere, which is a row
       * that sits STILL and out of view. */
      let lastAbs: number | null = null;
      const finish = () => {
        claimed.delete(lock);
        hunting.current = null;
        live.current = null;
        if (poll) { clearInterval(poll); poll = 0; }
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
        window.removeEventListener("keydown", stop);
      };
      const look = () => {
        const node = live.current;
        if (cancelled) return finish();
        // Between renders there may briefly be no element — wait, do not quit.
        if (!node || !node.isConnected) return;
        const abs = node.getBoundingClientRect().top + window.scrollY;
        const drifted = lastAbs !== null && Math.abs(abs - lastAbs) > 2;
        lastAbs = abs;
        if (inFullView(node)) {
          if (++settled >= STABLE_CHECKS) finish();
          return;
        }
        settled = 0;
        if (!drifted && ++moves > MAX_MOVES) {
          window.scrollTo({ top: startY, behavior: "auto" });
          return finish();
        }
        node.scrollIntoView({ block: "center", behavior: "auto" });
      };

      /* ⚠️ ONE RULE FOR EVERY PAGE, AND IT IS "LOOK, DON'T ASSUME".
       *
       * The tempting shortcut — after a real history step, trust the browser
       * and do nothing — is wrong, because `history.scrollRestoration` is
       * "auto" here and the browser is restoring alongside Next. On
       * /portal/tasks the two agree and land exactly; on /hrms/assets they do
       * not, and the list arrived carrying the RECORD's scroll position.
       * Trusting it meant the fix worked on the page it was written against
       * and quietly did nothing on the next one.
       *
       * So the watcher runs either way and stays harmless where restoration
       * was right: it only moves a row that is OUT of view. The delay is for
       * restoration to land first — checking before it does would nudge a page
       * that was about to be correct (measured: 62px out at 150ms, exact at
       * 400). */
      const begin = window.setTimeout(() => {
        poll = window.setInterval(look, WATCH_EVERY_MS);
        look();
      }, SETTLE_FIRST_MS);
      const giveUp = window.setTimeout(finish, WATCH_FOR_MS + SETTLE_FIRST_MS);

      setMarked(wanted);
      setWanted(null);
      window.setTimeout(() => {
        setMarked(null);
        clearTimeout(begin);
        clearTimeout(giveUp);
        finish();
      }, Math.max(MARK_MS, WATCH_FOR_MS + SETTLE_FIRST_MS));
    },
    [wanted, key]
  );

  // Nothing to hold on to once the watching is over.
  useEffect(() => () => { live.current = null; }, []);

  const isMarked = useCallback(
    (rowKey: string | number) => marked !== null && String(rowKey) === marked,
    [marked]
  );

  return { remember, attach, isMarked };
}
