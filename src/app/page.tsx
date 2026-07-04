import { redirect } from "next/navigation";
import { getAllTasks } from "@/lib/queries";
import { listTodos } from "./todos/actions";
import { CosHome } from "./_hub/cos-home";
import { TasksSection } from "./_hub/tasks-section";

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
};

export default async function HubPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;

  // Companies now live in the sidebar / dedicated index — no hub tab.
  if (sp.tab === "companies") redirect("/companies");

  if (sp.tab === "tasks") {
    return (
      <TasksSection
        sp={{
          company: sp.company, priority: sp.priority, flag: sp.flag, status: sp.status,
          noOwner: sp.noOwner, closed: sp.closed, view: sp.view, month: sp.month, q: sp.q, all: sp.all, unread: sp.unread, group: sp.group, archived: sp.archived, kind: sp.kind,
          mode: sp.mode, done: sp.done, quiet: sp.quiet, who: sp.who, whoMode: sp.whoMode,
        }}
      />
    );
  }

  // COS Home — the calm landing page.
  const [rows, todos] = await Promise.all([getAllTasks(), listTodos()]);
  return <CosHome rows={rows} todos={todos} />;
}
