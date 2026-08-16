import type { ReactNode } from "react";

/**
 * The Command Centre layout shell.
 *
 * Desk rule: the working area uses the WIDTH OF THE SCREEN. The centre column is
 * therefore unconstrained here — the app layout's 1600px cap is the only stop, so
 * home matches every other workspace instead of sitting in an 880px letterbox with
 * dead grey down both sides.
 *
 * The LEFT and RIGHT rails stay defined but collapsed — the owner will fill them
 * later (clock/weather on the left, live ticker + pins on the right). Enabling one
 * is a one-line change: pass `left` or `right`.
 */
export function CommandWall({
  children,
  left,
  right,
}: {
  children: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex w-full gap-6">
      <aside aria-hidden={!left} className={left ? "hidden w-[240px] shrink-0 xl:block" : "hidden w-0 shrink-0"}>
        {left}
      </aside>
      <div className="w-full min-w-0 flex-1">{children}</div>
      <aside aria-hidden={!right} className={right ? "hidden w-[240px] shrink-0 xl:block" : "hidden w-0 shrink-0"}>
        {right}
      </aside>
    </div>
  );
}
