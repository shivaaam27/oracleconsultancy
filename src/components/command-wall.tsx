import type { ReactNode } from "react";

/**
 * The Command Centre layout shell. Keeps the cockpit a CENTRED column (never
 * edge-to-edge) inside the app's existing max-w-[1100px] container, with LEFT and
 * RIGHT rails defined but collapsed for now — the owner will fill them later
 * (clock/weather on the left, live ticker + pins on the right). Enabling a rail
 * is then a one-line change: swap `hidden w-0` for a width on the matching <aside>.
 *
 * The centre is a single calm column (max-w) so nothing feels boxy or stretched;
 * modules stack with even rhythm so there are no awkward gaps.
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
    <div className="flex justify-center gap-6">
      <aside aria-hidden={!left} className={left ? "hidden w-[240px] shrink-0 xl:block" : "hidden w-0 shrink-0"}>
        {left}
      </aside>
      <div className="w-full min-w-0 max-w-[880px]">{children}</div>
      <aside aria-hidden={!right} className={right ? "hidden w-[240px] shrink-0 xl:block" : "hidden w-0 shrink-0"}>
        {right}
      </aside>
    </div>
  );
}
