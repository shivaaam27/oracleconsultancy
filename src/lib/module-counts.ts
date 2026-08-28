import { sb } from "@/db/supabase";

/**
 * One number per module, for the launcher tiles.
 *
 * ⚠️ EACH IS A `head: true` COUNT — no rows are fetched. The launcher must be the
 * fastest page in COS, because it sits between the owner and wherever he was
 * actually going. If a count ever needs real work, it does not belong here.
 *
 * ⚠️ A COUNT THAT FAILS SHOWS NOTHING, never an error and never a zero. A zero is
 * a claim ("you have no open roles"); a missing line is honest about not knowing.
 * The launcher is navigation, and navigation must not break because a table is
 * slow or a module is half-built.
 */
export type ModuleCount = { value: string; label: string };

const OPEN_TASK_STATUSES = "(Completed,Closed)";

async function count(run: () => Promise<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count: n, error } = await run();
    return error ? null : (n ?? null);
  } catch {
    return null;
  }
}

export async function moduleCounts(): Promise<Record<string, ModuleCount | null>> {
  const [tasks, orders, projects, journals, posts, orderLines, invoices] = await Promise.all([
    count(() =>
      sb.from("tasks").select("id", { count: "exact", head: true })
        .eq("archived", false)
        .not("status", "in", OPEN_TASK_STATUSES) as never
    ),
    count(() =>
      sb.from("rec_job_orders").select("id", { count: "exact", head: true })
        .eq("archived", false) as never
    ),
    count(() =>
      sb.from("projects").select("id", { count: "exact", head: true })
        .eq("archived", false).eq("status", "Active") as never
    ),
    count(() =>
      sb.from("journal_entries").select("id", { count: "exact", head: true })
        .eq("status", "Posted") as never
    ),
    count(() =>
      sb.from("mkt_posts").select("id", { count: "exact", head: true })
        .eq("archived", false) as never
    ),
    count(() =>
      sb.from("ops_order_lines").select("id", { count: "exact", head: true })
        .eq("archived", false) as never
    ),
    // ⚠️ ISSUED ONLY, the same test the rest of CocoZuri uses — a draft has been
    // sent to nobody. Counting drafts here would put a figure on the launcher
    // that no screen inside the module agrees with.
    count(() =>
      sb.from("cz_invoices").select("id", { count: "exact", head: true })
        .eq("status", "issued") as never
    ),
  ]);

  const one = (n: number | null, singular: string, plural: string): ModuleCount | null =>
    n == null ? null : { value: String(n), label: n === 1 ? singular : plural };

  /* ⚠️ EVERY MODULE GETS A FIGURE, and that is the point of the line.
   *
   * Three tiles carried none until 28 Aug 2026 — Marketing, Orders & Imports and
   * CocoZuri — so they had a blank band where their neighbours had a number, and
   * the file's own rule ("a tile that says nothing is just a big button") was
   * broken on nearly half the launcher. CocoZuri's was excused by a comment
   * saying the tile already reads "Being built", which stopped being true the day
   * the module shipped: no module is `soon` any more, so nothing said anything.
   *
   * A zero is honest here BECAUSE the count ran. The null case above is the one
   * that means "we could not find out", and that still shows nothing at all. */
  return {
    tasks: one(tasks, "open task", "open tasks"),
    recruitment: one(orders, "job order", "job orders"),
    ledger: one(journals, "posted journal", "posted journals"),
    projects: one(projects, "project running", "projects running"),
    marketing: one(posts, "post", "posts"),
    ops: one(orderLines, "order line", "order lines"),
    cocozuri: one(invoices, "invoice issued", "invoices issued"),
  };
}
