"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { MENU_Z, menuStyle, useAnchoredMenu } from "@/lib/use-anchored-menu";

/* ------------------------------------------------------------------ *
 * Help, where the confusion is.
 *
 * ⚠️ THIS EXISTS SO THE EXPLANATIONS CAN COME OUT OF THE FORMS. Screens in this
 * module had grown paragraphs of narration inside them — telling you what a
 * counter is, why a batch costs nothing to abandon, what a lot number does. All
 * of it true, none of it wanted by somebody who has used the screen before.
 *
 * The rule: a working screen says what a field IS. Anything explaining WHY goes
 * in here, one click away, and closes again.
 *
 * ⚠️ AND IT IS PORTALLED, ALWAYS — `useAnchoredMenu`. An absolute panel is
 * clipped by any scrolling ancestor, and portalling it then puts it behind the
 * overlay unless it carries `MENU_Z`. Both halves were photographed by the owner
 * in turn; six components had written it by hand before the hook existed.
 * ------------------------------------------------------------------ */

export function CocozuriHelp({
  title, children, label,
}: {
  title: string;
  children: React.ReactNode;
  /** Overrides the button's wording where "Help" is not the right word. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const { anchorRef, menuRef, pos, mounted, isInside } =
    useAnchoredMenu<HTMLButtonElement, HTMLDivElement>(open);

  // Esc closes it, and only it — guarded so it never closes out from under
  // something else that is open on top.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-label={label ?? `Help with ${title}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-fg-subtle transition-colors hover:text-fg"
      >
        <HelpCircle size={14} /> {label ?? "Help"}
      </button>

      {open && mounted && pos && createPortal(
        <>
          {/* A click anywhere else closes it. */}
          <div className="fixed inset-0" style={{ zIndex: MENU_Z - 1 }}
            onMouseDown={(e) => { if (!isInside(e.target as Node)) setOpen(false); }} />
          <div
            role="dialog"
            aria-label={`${title} — help`}
            ref={menuRef}
            style={{ ...menuStyle(pos), zIndex: MENU_Z, width: "21rem", maxWidth: "calc(100vw - 1.5rem)" }}
            className="overflow-hidden rounded-lg border border-border bg-bg-elev shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border bg-bg-subtle px-3 py-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{title}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close help"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:text-fg">
                <X size={13} />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto px-3 py-2.5 text-sm leading-relaxed text-fg-muted [&_strong]:text-fg">
              {children}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
