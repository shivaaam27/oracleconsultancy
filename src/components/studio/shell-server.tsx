import { sb } from "@/db/supabase";
import { taskHref } from "@/lib/task-href";
import { StudioShell, type StudioFootNote } from "./shell";

/** Server half of the Studio footer: the one fact it shows on the left, the
 *  next deadline coming up. One small query per page render, like the pill's
 *  overdue badge before it — decoration, so a failure shows nothing. */
export async function StudioShellServer() {
  let note: StudioFootNote = null;
  try {
    const todayEat = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
    const { data } = await sb
      .from("tasks")
      .select("code, action_item, deadline")
      .eq("archived", false)
      .not("status", "in", "(Completed,Closed)")
      .gte("deadline", `${todayEat}T00:00:00+03:00`)
      .order("deadline", { ascending: true })
      .limit(1);
    const t = data?.[0];
    if (t?.deadline) {
      const when = new Date(t.deadline).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).replace(",", "");
      note = { label: "Next deadline", text: `${when} · ${t.action_item}`, href: taskHref(t.code) };
    } else {
      note = { label: "Next deadline", text: "Nothing dated is coming up" };
    }
  } catch {
    /* decoration — never block the page */
  }
  return <StudioShell nextDeadline={note} />;
}
