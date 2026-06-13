import type { ReactNode } from "react";
import Image from "next/image";
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
  title?: string;
  subtitle?: ReactNode;
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

      <div className="relative text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500">
        <div className="relative mx-auto mb-4 h-20 w-20">
          {/* Soft accent halo — reads well in both light and dark. */}
          <div aria-hidden className="absolute -inset-3 rounded-[2rem] bg-accent/15 blur-2xl" />
          {/* Gradient frame around the white logo tile. */}
          <div className="relative h-20 w-20 rounded-[1.15rem] bg-gradient-to-br from-accent/50 via-border to-info/40 p-[2px] shadow-md">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-white">
              <Image src="/logo-source.png" alt="Oracle Consultancy" width={64} height={64} className="h-16 w-16 object-contain" />
            </div>
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{kicker}</h1>
        {title && <p className="mt-1 text-sm font-medium text-fg-muted">{title}</p>}
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>

      <div className="relative rounded-3xl glass elevated p-5 sm:p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">{children}</div>

      {footer && <div className="relative text-center text-xs text-fg-subtle">{footer}</div>}

      <p className="relative text-center text-[11px] text-fg-subtle">Oracle Consultancy · secure sign-in</p>
    </div>
  );
}
