import { redirect } from "next/navigation";
import { getAllTasks } from "@/lib/queries";
import { TasksSection } from "./_hub/tasks-section";
import { StudioHomeServer } from "./_hub/studio-home";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

type Sp = {
  tab?: string;
  // task filter params
  company?: string;
  priority?: string;
  flag?: string;
  status?: string;
  noOwner?: string;
  closed?: string;
  view?: string;
  month?: string;
  q?: string;
  all?: string;
  unread?: string;
  group?: string;
  archived?: string;
  kind?: string;
  mode?: string;
  done?: string;
  quiet?: string;
  who?: string;
  whoMode?: string;
  sort?: string;
  dir?: string;
};

export default async function HubPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  // The owner, or a director on the shared screens (lib/viewer.ts). The front
  // door lets a signed-in director reach "/", so the page decides.
  const viewer = await getViewer();
  if (!viewer) redirect("/portal");

  // Companies now live in the sidebar / dedicated index — no hub tab.
  if (sp.tab === "companies") redirect("/companies");

  if (sp.tab === "tasks") {
    return (
      <TasksSection
        sp={{
          company: sp.company, priority: sp.priority, flag: sp.flag, status: sp.status,
          noOwner: sp.noOwner, closed: sp.closed, view: sp.view, month: sp.month, q: sp.q, all: sp.all, unread: sp.unread, group: sp.group, archived: sp.archived, kind: sp.kind,
          mode: sp.mode, done: sp.done, quiet: sp.quiet, who: sp.who, whoMode: sp.whoMode,
          sort: sp.sort, dir: sp.dir,
        }}
      />
    );
  }

  // COS Home (mockup board Home). A director gets it cut down to their
  // companies — see StudioHomeServer.
  return <StudioHomeServer rows={await getAllTasks()} viewer={viewer} />;
}
