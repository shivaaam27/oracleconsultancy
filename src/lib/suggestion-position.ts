import { layoutRect } from "@/lib/zoom";

/**
 * Where a caret-anchored menu goes — the `/` menu, the `@` picker, the `[[` picker.
 *
 * ⚠️ THE BUG THIS EXISTS TO KILL. Each menu used to place itself, with the same
 * copied maths: measure your own height, and if there is not enough room below the
 * caret, flip above. It failed exactly when it mattered — **on a long note**. Typing
 * `/` on the last line of a note that had grown past one screen put the menu at
 * y=723 in an 838px viewport with a height of 304, so **189px of it hung below the
 * bottom of the screen** and the lower half of the list could not be reached or
 * clicked (measured, 17 Aug 2026).
 *
 * Three faults, and the fix addresses all three rather than re-tuning the flip:
 *
 *  1. **It measured a height that was not there yet.** `place()` ran in `onStart`,
 *     the instant the element was appended, and fell back to a hard-coded 260 when
 *     `offsetHeight` came back 0. A guess about the size decides whether to flip.
 *  2. **Nothing clamped the result.** Flip-or-not was the only lever, so any wrong
 *     guess put the menu off-screen with no second line of defence. Now the menu is
 *     **capped to the room on the side it opens into**, so it physically cannot
 *     overflow: if there are 120px, it is 120px tall and scrolls inside itself.
 *  3. **It decided once.** The list gets shorter as you type, the note scrolls under
 *     you, the window resizes — and the position from the moment of opening went
 *     stale. It now re-places on every update, on scroll (capture, so the note's own
 *     scroller counts) and on resize.
 *
 * Positioned through `layoutRect()`, not a raw `getBoundingClientRect()`: the portal
 * renders at `zoom: 0.8` and a raw rect lands 20% out. Notes are admin-only today so
 * the zoom is 1, but the day one of these appears there it is already right.
 *
 * **FORWARD RULE: any new caret-anchored popover uses this. Do not hand-roll the
 * maths a fourth time.**
 */

/** Distance from the caret, and from the edge of the screen. */
const GAP = 6;
const EDGE = 8;

/**
 * The part of the screen the reader can actually SEE.
 *
 * ⚠️ ON A PHONE THIS IS NOT `window.innerHeight`. When the on-screen keyboard
 * opens, `innerHeight` does not change — so a menu measured against it is placed
 * in the half of the screen the keyboard is covering, and typing `/` on a phone
 * appears to do nothing at all. `visualViewport` is the only thing that knows
 * where the keyboard is. Falls back to `innerHeight` where it is unavailable.
 */
function visibleViewport(): { height: number; width: number; offsetTop: number } {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return { height: window.innerHeight, width: window.innerWidth, offsetTop: 0 };
  return { height: vv.height, width: vv.width, offsetTop: vv.offsetTop };
}

/**
 * Place `el` against the caret rectangle `rect`.
 *
 * `el` is the renderer's wrapper; its first child is the panel that scrolls, and it
 * is that child which gets capped — it already carries `overflow-y-auto`, so a
 * capped menu scrolls its own list rather than spilling down the page.
 */
export function placeMenu(el: HTMLElement, rect: DOMRect): void {
  const zoom = layoutRect(document.body).zoom || 1;

  /* Everything below is in LAYOUT pixels, because `position: fixed` is laid out
     against the LAYOUT viewport. The visual viewport only tells us which BAND of
     that is currently visible — which is the part the keyboard changes. Mixing the
     two coordinate systems is the easy mistake here; they are kept apart on
     purpose. */
  const layoutH = window.innerHeight / zoom;
  const layoutW = window.innerWidth / zoom;

  const view = visibleViewport();
  const bandTop = view.offsetTop / zoom;
  const bandBottom = bandTop + view.height / zoom;

  const caretTop = rect.top / zoom;
  const caretBottom = rect.bottom / zoom;

  el.style.position = "fixed";
  el.style.zIndex = "60";

  const panel = (el.firstElementChild as HTMLElement | null) ?? el;

  // Release any cap from a previous placement BEFORE measuring, or the menu can
  // only ever shrink — one cramped position near the bottom of the screen would
  // keep it short for the rest of the session.
  panel.style.maxHeight = "";
  const natural = panel.offsetHeight || el.offsetHeight || 0;

  // Room measured against the VISIBLE band, so the keyboard counts.
  const below = bandBottom - caretBottom - GAP - EDGE;
  const above = caretTop - bandTop - GAP - EDGE;

  // Below by default — that is where the eye already is. Above only when it does
  // not fit below AND there is genuinely more room up there.
  const up = natural > below && above > below;
  const room = Math.max(0, up ? above : below);

  // The guarantee: never taller than the side it opens into. Whatever the height
  // measurement said, the menu ends up on screen.
  if (natural > room) panel.style.maxHeight = `${room}px`;

  // Keep it inside the left and right edges too — a caret near the right-hand side
  // of a wide window would otherwise push the panel off.
  const width = el.offsetWidth || panel.offsetWidth || 280;
  const left = Math.min(Math.max(EDGE, rect.left / zoom), Math.max(EDGE, layoutW - width - EDGE));
  el.style.left = `${left}px`;

  if (up) {
    el.style.top = "";
    el.style.bottom = `${layoutH - caretTop + GAP}px`;
  } else {
    el.style.bottom = "";
    el.style.top = `${caretBottom + GAP}px`;
  }
}

/**
 * Keeps a menu glued to the caret for as long as it is open.
 *
 * One of these per menu. `attach` on open, `update` on every change, `detach` on
 * close — the three points a Tiptap `Suggestion` renderer already has.
 */
export function createMenuPositioner() {
  let el: HTMLElement | null = null;
  let getRect: (() => DOMRect | null | undefined) | null = null;
  let frame = 0;

  const reposition = () => {
    if (!el || !getRect) return;
    const rect = getRect();
    if (rect) placeMenu(el, rect);
  };

  /* Place immediately so it never paints in the wrong spot, then again on the next
     frame — on the first call the element has only just been appended and its real
     height may not be known yet, which is precisely how the off-screen menu got
     through. The second pass corrects it before anyone can see. */
  const repositionSoon = () => {
    reposition();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(reposition);
  };

  return {
    attach(element: HTMLElement, rectFn: () => DOMRect | null | undefined) {
      el = element;
      getRect = rectFn;
      repositionSoon();
      // Capture phase, so scrolling the note's OWN scroller counts and not just
      // the window — on a long note that is the one that actually moves.
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
      // The keyboard opening does NOT fire `resize` on a phone — it moves the
      // visual viewport instead. Without these the menu stays where it was and
      // ends up behind the keyboard.
      window.visualViewport?.addEventListener("resize", reposition);
      window.visualViewport?.addEventListener("scroll", reposition);
    },
    update(rectFn: () => DOMRect | null | undefined) {
      getRect = rectFn;
      repositionSoon();
    },
    detach() {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      el = null;
      getRect = null;
    },
  };
}
