import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";

// Cheap, COUNT-only "glance" stats for the search palette entity hero.
// GET /api/entity-glance?type=&id=  →  { stats: { label, value }[] }
// Every count is wrapped so a single failing query omits its stat rather than
// 500-ing the whole response.

type Stat = { label: string; value: string | number };
const CLOSED = ["Completed", "Closed"];

type CountQuery = ReturnType<ReturnType<typeof sb.from>["select"]>;

async function count(
  table: string,
  build: (q: CountQuery) => unknown,
): Promise<number | null> {
  try {
    // head+count: no rows fetched, just the total.
    const q = sb.from(table).select("*", { count: "exact", head: true });
    const { count: c, error } = (await (build(q) as unknown as Promise<{
      count: number | null;
      error: unknown;
    }>));
    if (error) return null;
    return c ?? 0;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const type = (req.nextUrl.searchParams.get("type") || "").toLowerCase();
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!type || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ stats: [] });
  }

  const stats: Stat[] = [];
  const add = (label: string, value: number | string | null | undefined) => {
    if (value === null || value === undefined) return;
    stats.push({ label, value });
  };

  try {
    if (type === "company") {
      const [openTasks, people, docs] = await Promise.all([
        count("tasks", (q) => q.eq("company_id", id).not("status", "in", `(${CLOSED.join(",")})`)),
        count("person_companies", (q) => q.eq("company_id", id)),
        count("documents", (q) => q.eq("company_id", id)),
      ]);
      add("Open tasks", openTasks);
      add("People", people);
      add("Documents", docs);
    } else if (type === "person") {
      // Open tasks the person is assigned to (via task_assignees → tasks).
      let openTasks: number | null = null;
      try {
        const { data } = await sb.from("task_assignees").select("task_id").eq("person_id", id);
        const ids = [...new Set((data ?? []).map((r: { task_id: number }) => r.task_id))];
        if (ids.length) {
          const { count: c } = await sb
            .from("tasks")
            .select("*", { count: "exact", head: true })
            .in("id", ids)
            .not("status", "in", `(${CLOSED.join(",")})`);
          openTasks = c ?? 0;
        } else openTasks = 0;
      } catch {
        openTasks = null;
      }
      const [docs, reports] = await Promise.all([
        count("documents", (q) => q.eq("person_id", id)),
        count("people", (q) => q.eq("manager_id", id)),
      ]);
      add("Open tasks", openTasks);
      add("Documents", docs);
      add("Direct reports", reports);
    } else if (type === "task") {
      const [updates, assignees] = await Promise.all([
        count("task_updates", (q) => q.eq("task_id", id)),
        count("task_assignees", (q) => q.eq("task_id", id)),
      ]);
      add("Updates", updates);
      add("Assignees", assignees);
      try {
        const { data } = await sb.from("tasks").select("created_date").eq("id", id).maybeSingle();
        const created = (data as { created_date?: string } | null)?.created_date;
        if (created) {
          const days = Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000));
          add("Days open", days);
        }
      } catch {
        /* omit */
      }
    } else if (type === "document") {
      try {
        const { data } = await sb
          .from("documents")
          .select("category, expiry_date")
          .eq("id", id)
          .maybeSingle();
        const row = data as { category?: string | null; expiry_date?: string | null } | null;
        if (row?.category) add("Category", row.category);
        if (row?.expiry_date) {
          add("Expiry", new Date(row.expiry_date).toLocaleDateString("en-GB"));
        }
      } catch {
        /* omit */
      }
    }
  } catch (e) {
    console.error("entity-glance error:", e);
  }

  return NextResponse.json({ stats });
}
