import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

/** Shared shell for the two sign-in screens (/login and /portal/login):
 *  aurora-lit backdrop, centred glass card, brand mark, theme toggle.
 *  Pure presentation — forms are passed as children. */
export function AuthShell({
  kicker,
  title,
  subtitle,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative mx-auto flex min-h-[88vh] w-full max-w-sm flex-col justify-center gap-6">
      {/* Atmospheric glows — same family as the page Hero, reduced-motion safe. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="aurora-a absolute -top-24 right-[8%] h-96 w-96 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.22), transparent 70%)" }}
        />
        <div
          className="aurora-b absolute bottom-[-10%] left-[4%] h-80 w-80 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--info) / 0.18), transparent 72%)" }}
        />
        <div
          className="aurora-a absolute top-1/3 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--success) / 0.10), transparent 72%)" }}
        />
      </div>

      <div className="absolute right-0 top-4">
        <ThemeToggle />
      </div>

      <div className="relative text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl glass elevated ring-1 ring-border text-xl font-semibold text-accent">
          OC
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-muted">{kicker}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
      </div>

      <div className="relative rounded-3xl glass elevated p-5 sm:p-6">{children}</div>

      {footer && <div className="relative text-center text-xs text-fg-subtle">{footer}</div>}
    </div>
  );
}
