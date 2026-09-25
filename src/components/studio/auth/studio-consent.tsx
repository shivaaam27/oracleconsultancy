"use client";

/**
 * The frame of the "Connect an assistant" screen (/mcp/connect) in Studio,
 * 25 Sept 2026. It is the sign-in screen's own furniture — the same dark brand
 * panel on the desk, the same compact panel above the form on a phone, the same
 * theme button — because a consent screen that looks like somebody else's
 * website is one people click through without reading (and it is exactly the
 * feeling a phishing page gives).
 *
 * Presentational only: the page decides what goes inside (the consent form, or
 * a plain "that request isn't right" message), and nothing here reads data.
 */
import type { ReactNode } from "react";
import { BrandCompact, BrandPanel, ThemeButton } from "@/components/studio/auth/studio-sign-in";

export function StudioConsentFrame({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="studio fixed inset-0 z-[60] overflow-y-auto bg-[var(--st-page)] text-[var(--st-ink)] [font-family:var(--font-geist),var(--font-sans)]">
      <span className="hidden lg:contents"><ThemeButton /></span>
      <div className="mx-auto grid min-h-full max-w-[1280px] grid-cols-1 gap-5 p-3 sm:p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:p-5">
        <BrandPanel />
        <div className="flex flex-col items-center justify-center px-1 pb-2 pt-1 sm:px-2 sm:py-14">
          <div className="flex w-full max-w-[440px] flex-col gap-3 sm:gap-6 lg:max-w-[400px]">
            <BrandCompact />
            <div className="flex flex-col gap-4 rounded-[22px] bg-[var(--st-surface)] p-4 sm:gap-6 sm:p-6 lg:bg-transparent lg:p-0">
              <div>
                <h1 className="m-0 text-[28px] font-medium leading-none tracking-[-0.035em] sm:text-[40px]">{title}</h1>
                {sub && <div className="m-0 mt-2.5 text-[14px] leading-relaxed text-[var(--st-ink)]">{sub}</div>}
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A request that cannot be honoured — said plainly, with nothing to press. */
export function StudioConsentProblem({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="alert" className="rounded-[14px] bg-[var(--st-bad-wash)] px-4 py-3.5">
      <p className="m-0 text-[14px] font-semibold text-[var(--st-late-text)]">{title}</p>
      <p className="m-0 mt-1 text-[13px] leading-relaxed text-[var(--st-ink)]">{detail}</p>
    </div>
  );
}
