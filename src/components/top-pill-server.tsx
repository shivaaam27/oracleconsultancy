import { sb } from "@/db/supabase";
import { TopPill } from "./top-pill";

/** Server wrapper for the nav pill. Fetches the live overdue count so the Home
 *  tab can carry its red badge (one cheap HEAD count per page render). */
export async function TopPillServer() {
  let overdue = 0;
  try {
    // Mirror the home hero's figure (signals: flag "overdue" OR "escalate-now"):
    // open + past deadline, excluding Escalated-status tasks (they count as
    // escalations, not overdue) — so the badge and the hero agree.
    const todayEat = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" })}T00:00:00+03:00`);
    const { count } = await sb
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("archived", false)
      .not("status", "in", "(Completed,Closed,Escalated)")
      .lt("deadline", todayEat.toISOString());
    overdue = count ?? 0;
  } catch {
    /* badge is decoration — never block nav */
  }
  return <TopPill overdue={overdue} />;
}
