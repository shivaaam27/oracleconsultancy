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
  const [tasks, orders, projects, journals] = await Promise.all([
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
  ]);

  const one = (n: number | null, singular: string, plural: string): ModuleCount | null =>
    n == null ? null : { value: String(n), label: n === 1 ? singular : plural };

  return {
    tasks: one(tasks, "open task", "open tasks"),
    recruitment: one(orders, "job order", "job orders"),
    ledger: one(journals, "posted journal", "posted journals"),
    projects: one(projects, "project running", "projects running"),
    // Nothing to count yet, and saying "0" would read as a failure rather than
    // as "not built". The tile already says "Being built".
    cocozuri: null,
  };
}
