import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { MODULES } from "@/lib/nav";
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
 */
export default async function ModulesPage() {
  const counts = await moduleCounts();

  return (
    <div className="mx-auto w-full max-w-[68rem] space-y-5">
      <PageHeader
        title="Modules"
        sub="Each of the businesses COS runs. Everything else is still one keystroke away — ⌘K."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const count = counts[m.id];
          const tile = (
            <>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                    m.soon ? "bg-bg-subtle text-fg-subtle" : "bg-accent-soft text-accent",
                  )}
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[14px] font-semibold text-fg">{m.label}</h2>
                    {m.soon && (
                      <span className="shrink-0 rounded bg-bg-subtle px-1.5 py-px text-[10px] font-medium text-fg-subtle">
                        Being built
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-fg-muted">{m.blurb}</p>
                </div>
              </div>
              {/* One number, and it is the number you would have opened the module
                  to find out. A tile that says nothing is just a big button. */}
              {count && (
                <p className="mt-3 border-t border-border pt-2.5 text-[12px] text-fg-muted">
                  <span className="tabular text-[15px] font-semibold text-fg">{count.value}</span>{" "}
                  {count.label}
                </p>
              )}
            </>
          );

          const shell =
            "flex flex-col rounded-lg border border-border bg-bg-elev p-3.5 transition-colors";

          return m.soon ? (
            <div key={m.id} className={cn(shell, "opacity-70")}>
              {tile}
            </div>
          ) : (
            <Link key={m.id} href={m.home} className={cn(shell, "hover:border-accent/40 hover:bg-bg-subtle")}>
              {tile}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
