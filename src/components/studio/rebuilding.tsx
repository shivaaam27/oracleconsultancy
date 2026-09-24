import Link from "next/link";
import { StudioScope, StudioHeader, stBtn } from "./kit";

/** A page a director cannot use until it is rebuilt in the Studio design
 *  (owner, 25 Sept 2026: "block them so no one can access them until we
 *  rebuild them"). Kept as a page, not a silent redirect, so an old link says
 *  what happened instead of dropping the reader somewhere unexpected. */
export function StudioRebuilding({ title }: { title: string }) {
  return (
    <StudioScope className="space-y-5">
      <StudioHeader title={title} />
      <div className="st-tex-rings flex flex-col items-start gap-3 rounded-[20px] bg-[var(--st-card)] px-6 py-6 text-[var(--st-on-card)]">
        <div className="text-[22px] font-medium tracking-[-0.02em]">Being rebuilt</div>
        <p className="m-0 max-w-[52ch] text-[13px] text-[var(--st-on-card-muted)]">
          {title} is being redesigned for the new screens and is closed until it is ready. Everything in it is kept.
        </p>
        <Link href="/" className={stBtn.onCard}>Back to Home</Link>
      </div>
    </StudioScope>
  );
}
