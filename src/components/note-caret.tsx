"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";

/**
 * A caret you can SEE — and one that stays where you left it.
 *
 * ⚠️ WHY. The owner's words: "the blinker goes transparent … so I don't see or
 * know where I am to select, copy etc." Measured in the browser: the native
 * caret is a 1px hairline, the browser stops drawing it the moment the WINDOW
 * loses focus (a click on the scrollbar in the Windows shell, an alt-tab, a
 * toolbar button that takes focus), and ProseMirror's own `.ProseMirror-focused`
 * class — which the active-line band was gated on — drops at the same moment.
 * So both "where am I" signals vanished together, exactly when he looked away
 * and back.
 *
 * This draws a second marker: a 2px accent bar at the caret position, laid
 * OVER the writing. It is not a replacement for the native caret (that stays,
 * so IME, selection and everything else the browser does are untouched); it is
 * the mark that survives. Rules:
 *  - shown while the note is LIVE: from the first focus until focus moves to
 *    something else on the page. Losing the window does NOT count — that is
 *    the case it exists for;
 *  - hidden while there is a real selection (that is its own, louder marker);
 *  - repositioned on every transaction, and on scroll and resize, since the
 *    caret's screen position moves with the paper;
 *  - it blinks like a caret, so it reads as one.
 *
 * `data-note-live` on the scroller is the same flag the active-line band uses
 * (globals.css), so the band and the bar appear and disappear together.
 */
export function NoteCaret({ editor, scroller }: { editor: Editor | null; scroller: RefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = useState<{ top: number; left: number; height: number } | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const box = scroller.current;

    const place = () => {
      const b = scroller.current;
      if (!b) return;
      // ⚠️ NOT the `focus` event alone. When the window is not focused the
      // browser sets `activeElement` but fires no focus event, so a note
      // clicked into from an unfocused window would never go live. The
      // active element is the fact; the event is only a hint.
      const a = document.activeElement;
      if (a && (a === dom || dom.contains(a))) setLive(true);
      const { selection } = editor.state;
      if (!selection.empty) { setPos(null); return; }
      try {
        const c = editor.view.coordsAtPos(selection.head);
        const r = b.getBoundingClientRect();
        // Coordinates relative to the scroller's CONTENT, so the bar scrolls
        // with the paper rather than sticking to the glass.
        setPos({
          top: c.top - r.top + b.scrollTop,
          left: c.left - r.left + b.scrollLeft,
          height: Math.max(14, c.bottom - c.top),
        });
      } catch {
        setPos(null); // a position mid-transaction can be out of range
      }
    };

    const onFocus = () => { setLive(true); place(); };
    const onBlur = (e: FocusEvent) => {
      // Focus going NOWHERE (null) is the window losing focus — keep the mark.
      // Focus going to another element on the page means the person is now
      // somewhere else, and a caret they are not using is clutter.
      const to = e.relatedTarget as HTMLElement | null;
      if (to && !dom.contains(to) && !to.closest("[data-note-toolbar]")) setLive(false);
    };
    const onDocFocus = (e: FocusEvent) => {
      // The title field and the toolbar are part of the sheet; anything else
      // taking focus ends the note's turn.
      const t = e.target as HTMLElement | null;
      if (!t || t === dom || dom.contains(t)) return;
      if (t.closest("[data-note-toolbar]") || t.classList.contains("note-title-field")) return;
      setLive(false);
    };

    // A press anywhere off the sheet is intent, whether or not the browser
    // gets round to firing focus events (it does not while the window is
    // unfocused).
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t === dom || dom.contains(t) || t.closest("[data-note-toolbar]")) return;
      setLive(false);
    };
    document.addEventListener("mousedown", onDocDown, true);

    editor.on("transaction", place);
    editor.on("selectionUpdate", place);
    dom.addEventListener("focus", onFocus);
    dom.addEventListener("blur", onBlur);
    // A click that lands on the same position moves no selection and fires no
    // transaction — check after the browser has placed the caret.
    const onClick = () => { setTimeout(place, 0); };
    dom.addEventListener("mouseup", onClick);
    document.addEventListener("focusin", onDocFocus);
    box?.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    if (editor.view.hasFocus()) onFocus();

    return () => {
      editor.off("transaction", place);
      editor.off("selectionUpdate", place);
      dom.removeEventListener("focus", onFocus);
      dom.removeEventListener("blur", onBlur);
      dom.removeEventListener("mouseup", onClick);
      document.removeEventListener("focusin", onDocFocus);
      document.removeEventListener("mousedown", onDocDown, true);
      box?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [editor, scroller]);

  // The flag the band reads. Set on the scroller so CSS can gate on it without
  // any coupling to ProseMirror's focus class.
  useEffect(() => {
    const b = scroller.current;
    if (!b) return;
    if (live) b.setAttribute("data-note-live", "1"); else b.removeAttribute("data-note-live");
  }, [live, scroller]);

  if (!live || !pos) return null;
  return (
    <span
      aria-hidden
      className="note-caret-mark pointer-events-none absolute z-[2]"
      style={{ top: pos.top, left: pos.left - 1, height: pos.height }}
    />
  );
}
