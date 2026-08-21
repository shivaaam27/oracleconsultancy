"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { blockMovePlan } from "@/lib/offline-notes-shared";

/* ------------------------------------------------------------------ *
 * Moving a block with a finger — the one gap Phase 8 left open.
 *
 * ⚠️ WHY THE DRAG HANDLE IS NOT ENOUGH. Tiptap's handle floats beside whichever
 * block the MOUSE is over. A touch screen has no hover, so on a phone the handle
 * never appears at all and there is no way to reorder anything short of cut and
 * paste. It is not broken — it is a mouse affordance — but it leaves the phone
 * with nothing.
 *
 * The gesture: press and hold a block for a moment, feel it lift, drag it where
 * it should go, let go. That is what every list on a phone does, so it needs no
 * explaining.
 *
 * Three things make it behave rather than fight the browser:
 *
 *  1. **It only engages after a still press.** Moving your finger before the
 *     timer is up cancels it, so scrolling a long note never picks a block up by
 *     accident. That test — held still, not just held — is the whole difference
 *     between this and a note that grabs paragraphs while you read.
 *  2. **Once engaged it takes the touch away from the page.** `touchmove` is
 *     listened to with `passive: false` so it can be prevented; without that the
 *     note scrolls under the finger while the block is being dragged and the two
 *     fight each other.
 *  3. **It moves whole top-level blocks only.** Not halves of a table, not a list
 *     item out of its list — the unit you can see is the unit that moves.
 * ------------------------------------------------------------------ */

/** How long a still press lasts before the block lifts. Long enough not to fire
 *  while scrolling, short enough not to feel broken. */
const HOLD_MS = 420;
/** Movement above this during the hold means you meant to scroll, not to drag. */
const SLOP_PX = 10;
/** Within this of the top or bottom edge, the page creeps to let you reach. */
const EDGE_PX = 64;
const EDGE_SPEED = 12;

type Line = { top: number; left: number; width: number } | null;

export function NoteTouchDrag({ editor }: { editor: Editor | null }) {
  const [line, setLine] = useState<Line>(null);
  const [dragging, setDragging] = useState(false);
  const held = useRef<{ index: number; el: HTMLElement } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const target = useRef<number | null>(null);
  const creep = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    /** The top-level block an element sits inside, and its index. Only direct
     *  children of the editor count — a paragraph inside a table cell belongs to
     *  the table, and the table is what moves. */
    const blockAt = (el: Element | null): { index: number; el: HTMLElement } | null => {
      let node: Element | null = el;
      while (node && node.parentElement !== dom) node = node.parentElement;
      if (!node || node.parentElement !== dom) return null;
      const index = Array.prototype.indexOf.call(dom.children, node);
      return index >= 0 ? { index, el: node as HTMLElement } : null;
    };

    const clearHold = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };

    const stopCreep = () => {
      if (creep.current) clearInterval(creep.current);
      creep.current = null;
    };

    const lift = (block: { index: number; el: HTMLElement }) => {
      held.current = block;
      setDragging(true);
      block.el.classList.add("note-block-lifted");
      // A short buzz is the only way a touch screen can say "you have it now".
      // Absent on iOS and that is fine — the block visibly lifts as well.
      try {
        navigator.vibrate?.(12);
      } catch {
        /* not every browser has it, and it is decoration */
      }
    };

    const drop = () => {
      const block = held.current;
      stopCreep();
      clearHold();
      setLine(null);
      setDragging(false);
      startPt.current = null;
      held.current = null;
      if (!block) return;
      block.el.classList.remove("note-block-lifted");

      const to = target.current;
      target.current = null;
      if (to == null || to === block.index || to === block.index + 1) return;
      moveBlock(editor, block.index, to);
    };

    /** Where the block would land, drawn as a line between two blocks. */
    const aim = (clientY: number) => {
      const kids = Array.from(dom.children) as HTMLElement[];
      let index = kids.length;
      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      target.current = index;

      const box = dom.getBoundingClientRect();
      const at = kids[index];
      const y = at ? at.getBoundingClientRect().top : (kids[kids.length - 1]?.getBoundingClientRect().bottom ?? box.top);
      setLine({ top: y - box.top, left: 0, width: box.width });
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const block = blockAt(document.elementFromPoint(t.clientX, t.clientY));
      if (!block) return;
      startPt.current = { x: t.clientX, y: t.clientY };
      clearHold();
      timer.current = setTimeout(() => lift(block), HOLD_MS);
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;

      // Not engaged yet: any real movement means a scroll was intended.
      if (!held.current) {
        const s = startPt.current;
        if (s && (Math.abs(t.clientX - s.x) > SLOP_PX || Math.abs(t.clientY - s.y) > SLOP_PX)) clearHold();
        return;
      }

      // Engaged: the touch belongs to us now, not to the scroller.
      e.preventDefault();
      aim(t.clientY);

      // Near an edge, creep the page so a block can be dragged past what fits.
      stopCreep();
      const y = t.clientY;
      const h = window.innerHeight;
      if (y < EDGE_PX) creep.current = setInterval(() => window.scrollBy(0, -EDGE_SPEED), 16);
      else if (y > h - EDGE_PX) creep.current = setInterval(() => window.scrollBy(0, EDGE_SPEED), 16);
    };

    dom.addEventListener("touchstart", onStart, { passive: true });
    dom.addEventListener("touchmove", onMove, { passive: false });
    dom.addEventListener("touchend", drop);
    dom.addEventListener("touchcancel", drop);
    return () => {
      dom.removeEventListener("touchstart", onStart);
      dom.removeEventListener("touchmove", onMove);
      dom.removeEventListener("touchend", drop);
      dom.removeEventListener("touchcancel", drop);
      clearHold();
      stopCreep();
    };
  }, [editor]);

  if (!line || !dragging) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-20 h-0.5 rounded bg-accent"
      style={{ top: line.top, left: line.left, width: line.width }}
    />
  );
}

/**
 * Move a top-level block to a new place in the document.
 *
 * The index arithmetic lives in `blockMovePlan` — pure, and tested, because the
 * shift that happens between the delete and the insert is the easy thing to get
 * wrong and the hard thing to see. Both edits go in ONE transaction, so pulling
 * a paragraph back takes one press of undo, not two.
 */
function moveBlock(editor: Editor, from: number, to: number) {
  const { state, dispatch } = editor.view;
  const doc = state.doc;
  const sizes: number[] = [];
  doc.forEach((n) => sizes.push(n.nodeSize));

  const plan = blockMovePlan(sizes, from, to);
  if (!plan) return;

  const node = doc.child(from);
  const tr = state.tr.delete(plan.deleteFrom, plan.deleteTo).insert(plan.insertAt, node);
  dispatch(tr.scrollIntoView());
  editor.commands.focus();
}
