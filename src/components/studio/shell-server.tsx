import { sb } from "@/db/supabase";
import { isAdminSession } from "@/lib/admin-auth";
import { getViewer } from "@/lib/viewer";
import { taskHref } from "@/lib/task-href";
import { StudioShell, type StudioFootNote } from "./shell";

/** Server half of the Studio footer: the one fact it shows on the left, the
 *  next deadline coming up. One small query per page render, like the pill's
 *  overdue badge before it — decoration, so a failure shows nothing. */
export async function StudioShellServer() {
  let note: StudioFootNote = null;
  // ⚠️ ONLY FOR THE OWNER. The root layout renders this on EVERY page and only
  // hides it on the client (HideOnPortal) — so without this check the owner's
  // next task title rode along in the page data of the staff portal and of the
  // public /e/ and /r/ links (portal audit, 25 Sept 2026).
  if (!(await isAdminSession())) {
    // A director on the shared screens gets their own footer (lib/viewer.ts).
    const v = await getViewer();
    if (v?.kind === "director") {
      return <StudioShell nextDeadline={null} director={{ name: v.name, outbox: !!v.person.caps.navOutbox, createTasks: !!v.person.caps.createTasks }} />;
    }
    return <StudioShell nextDeadline={null} />;
  }
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
