"use client";

/**
 * "Not found" and "something went wrong", in the Studio look — one card for
 * every such page in COS (owner, 25 Sept 2026: "redesign the 404 page with our
 * new design system wide"). The admin side, the portal and Notes all use it.
 *
 * A dark card on the grey page, the big figure (404, or a warning mark), what
 * happened in one plain sentence, and the ways out: back where you were, home,
 * and — for an error — try again. An error shows its reference so a report can
 * be matched to the log.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, RotateCcw } from "lucide-react";
import { StudioScope, stBtn } from "./kit";
import { cn } from "@/lib/cn";

export function StudioOops({ kind, title, body, home = "/", homeLabel = "Home", onRetry, reference }: {
  kind: "404" | "error";
  title: string;
  body: string;
  home?: string;
  homeLabel?: string;
  onRetry?: () => void;
  reference?: string;
}) {
  const router = useRouter();
  const back = () => { if (window.history.length > 1) router.back(); else router.push(home); };
  return (
    <StudioScope className="flex min-h-[62vh] items-center justify-center px-1 py-8">
      <div className="st-tex-rings st-pop relative w-full max-w-[560px] overflow-hidden rounded-[24px] bg-[var(--st-card)] px-6 py-7 text-[var(--st-on-card)] sm:px-9 sm:py-9">
        <div className="flex items-end gap-4">
          {kind === "404" ? (
            <span className="text-[88px] font-medium leading-[0.8] tracking-[-0.06em] tabular-nums sm:text-[112px]">404</span>
          ) : (
            <span aria-hidden className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-[#3A1D2C] text-[44px] font-semibold leading-none text-[#F07BBE] sm:h-[84px] sm:w-[84px]">!</span>
          )}
          <span className={cn("mb-1.5 inline-flex h-6 items-center gap-1.5 rounded-lg px-2.5 text-xs", kind === "404" ? "bg-[#26282C] text-[#C9CBCF]" : "bg-[#3A1D2C] text-[#F07BBE]")}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: kind === "404" ? "#8E9197" : "#E0479E" }} />
            {kind === "404" ? "Not found" : "Did not load"}
          </span>
        </div>
        <h1 className="m-0 mt-6 text-[26px] font-medium leading-tight tracking-[-0.02em] sm:text-[30px]">{title}</h1>
        <p className="m-0 mt-2.5 max-w-[46ch] text-[14px] leading-relaxed text-[var(--st-on-card-muted)]">{body}</p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          {onRetry && (
            <button type="button" onClick={onRetry} className={cn(stBtn.onCard, "h-10 px-4 text-[13px]")}><RotateCcw size={14} />Try again</button>
          )}
          <button type="button" onClick={back} className={cn(onRetry ? stBtn.onCardGhost : stBtn.onCard, "h-10 px-4 text-[13px]")}><ArrowLeft size={14} />Go back</button>
          <Link href={home} className={cn(stBtn.onCardGhost, "h-10 px-4 text-[13px]")}><Home size={14} />{homeLabel}</Link>
        </div>
        {reference && <div className="mt-6 text-[11px] text-[#6E7177]">Reference <span className="st-mono">{reference}</span> — quote it if this keeps happening.</div>}
      </div>
    </StudioScope>
  );
}
