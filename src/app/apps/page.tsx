import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { MODULES, moduleQuick } from "@/lib/nav";
import { moduleCounts } from "@/lib/module-counts";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modules — Oracle Consultancy" };

/**
 * `/apps` — the launcher.
 *
 * The rail had grown to 23 destinations in one column, which is a list rather
 * than a filing system. This divides the app the way the BUSINESSES are divided,
 * which is what ERPNext does and what the owner asked for.
 *
 * ⚠️ IT IS NOT A REPLACEMENT FOR THE RAIL, AND THAT MATTERS. A launcher on its
 * own makes every page two clicks instead of one, which is more work, not less.
 * It only pays off alongside the other two halves: a sidebar scoped to the module
 * you are in, and pins that cross module boundaries. See
 * `memory/erp_navigation_plan.md`.
 *
 * ⚠️ `/` DOES NOT MOVE. The command centre stays the home of Task Management —
 * putting a click in front of the page the owner opens most would be a poor
 * trade for tidiness.
 *
 * ⚠️ A TILE IS A SHELF, NOT A DOOR (28 Aug 2026, owner's ask). Every tile carries
 * a figure AND the three or four pages people actually open, so the launcher
 * lands you on the work rather than on another front door — you come here to
 * reach the stock book, not the CocoZuri desk. The shortcuts come from
 * `module.quick` in `nav.ts` and `nav.test.ts` proves each one names a page
 * inside its own module.
 *
 * ⚠️ ONE CARD, NOT TWO STACKED BOXES. The first cut gave the heading its own
 * hover band and then a rule, then the count, then another row of chips — four
 * bands in a 129px card, and a module with no shortcuts (Projects) got an empty
 * section between two rules. The figure now sits with the words it describes and
 * there is a single hairline, above the only part of the card that is a row of
 * links.
 */
export default async function ModulesPage() {
  const counts = await moduleCounts();

  return (
    <div className="mx-auto w-full max-w-[84rem] space-y-5">
      <PageHeader
        title="Modules"
        sub="Each of the businesses COS runs. Everything else is still one keystroke away — ⌘K."
      />

      {/* ⚠️ THREE COLUMNS ONLY ONCE THERE IS ROOM FOR THEM. At `lg` the desk rail
          takes 208px and three tiles would be ~330px each — too narrow for a
          blurb and four chips. Two columns until `xl`, where a tile settles at
          ~400px, which is the width the text was written for. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const count = counts[m.id];
          const quick = moduleQuick(m);

          return (
            <div
              key={m.id}
              className={cn(
                "flex flex-col rounded-lg border border-border bg-bg-elev transition-colors",
                m.soon ? "opacity-70" : "hover:border-accent/40",
              )}
            >
              <div className="flex flex-1 items-start gap-3 p-3.5">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    m.soon ? "bg-bg-subtle text-fg-subtle" : "bg-accent-soft text-accent",
                  )}
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/* The heading is the link, rather than a band wrapping the
                        top of the card — the chips below are links too, and an
                        anchor cannot sit inside an anchor. */}
                    {m.soon ? (
                      <h2 className="truncate text-sm font-semibold text-fg">{m.label}</h2>
                    ) : (
                      <h2 className="min-w-0 truncate text-sm font-semibold">
                        <Link href={m.home} className="text-fg hover:text-accent">
                          {m.label}
                        </Link>
                      </h2>
                    )}
                    {m.soon && (
                      <span className="shrink-0 rounded bg-bg-subtle px-1.5 py-px text-xs font-medium text-fg-subtle">
                        Being built
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-snug text-fg-muted">{m.blurb}</p>
                  {/* One number, and it is the number you would have opened the
                      module to find out. A tile that says nothing is just a big
                      button. ⚠️ A missing line means the count could not be
                      taken — never a zero dressed up as one. See
                      `module-counts.ts`. */}
                  {count && (
                    <p className="mt-2 text-sm text-fg-muted">
                      <span className="tabular font-semibold text-fg">{count.value}</span>{" "}
                      {count.label}
                    </p>
                  )}
                </div>
              </div>

              {quick.length > 0 && (
                /* ⚠️ NO ICON ON A CHIP, and it is a fitting decision rather than
                   a taste one. Measured at a 396px tile: four chips WITH icons
                   summed 368px into 366px of room, so Recruitment wrapped to a
                   second line and stretched its whole grid row — every module is
                   one longer word away from the same. Dropping the icon frees
                   18px a chip, which is the difference between "it fits today"
                   and "it fits". The module's own icon is six inches above
                   them; these labels need no second one. */
                <div className="flex flex-wrap gap-1 border-t border-border px-3.5 py-2.5">
                  {quick.map((q) => (
                    <Link
                      key={q.id}
                      href={q.href}
                      className="inline-flex items-center rounded border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                    >
                      {q.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
