import Link from "next/link";
import { ListTodo, MessageSquare } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel } from "@/components/surface-kit";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/** Display name + management flag for a created_by stamp. */
function authorOf(by: string | null, myName: string): { name: string; management: boolean; me: boolean } {
  if (!by) return { name: "System", management: false, me: false };
  if (by.startsWith("portal-mgr:")) {
    const n = by.slice(11);
    return { name: n === myName ? "You" : n, management: true, me: n === myName };
  }
  if (by.startsWith("portal:")) {
    const n = by.slice(7);
    return { name: n === myName ? "You" : n, management: false, me: n === myName };
  }
  if (by === "ai-command") return { name: "COS Assistant", management: true, me: false };
  return { name: "Management", management: true, me: false };
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

type Row = {
  id: number;
  body: string;
  created_at: string;
  created_by: string | null;
  code: string;
  action_item: string;
};

export default async function PortalActivity() {
  const me = (await getPortalPerson())!;
  const ids = await visibleTaskIds(me);

  let rows: Row[] = [];
  if (ids.length > 0) {
    const { data } = await sb
      .from("task_updates")
      .select("id,body,created_at,created_by,tasks(code,action_item)")
      .in("task_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(60);
    rows = (data ?? []).map((u) => {
      const t = u.tasks as unknown as { code: string; action_item: string } | null;
      return {
        id: u.id as number,
        body: u.body as string,
        created_at: u.created_at as string,
        created_by: u.created_by as string | null,
        code: t?.code ?? "",
        action_item: t?.action_item ?? "",
      };
    });
  }

  // Group by day, newest first.
  const groups: Array<{ label: string; items: Row[] }> = [];
  for (const r of rows) {
    const label = dayLabel(r.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={20} />
      <Hero
        title="Activity"
        subtitle={
          me.portalRole === "manager"
            ? "Every update across your tasks and your team's tasks."
            : "Every update across your tasks, newest first."
        }
      />

      <section className="flex flex-col gap-3">
        {groups.length === 0 && (
          <Panel className="p-6 text-center text-sm text-fg-muted">No activity yet.</Panel>
        )}
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-2">
            <SectionLabel icon={<MessageSquare size={13} />}>{g.label}</SectionLabel>
            {g.items.map((r) => {
              const a = authorOf(r.created_by, me.name);
              return (
                <Link key={r.id} href={`/portal/task/${r.code}`} className="block group">
                  <Panel
                    className={`p-3.5 transition-shadow group-hover:ring-accent/40 ${
                      a.management ? "ring-accent/20" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`font-semibold ${a.management ? "text-accent" : a.me ? "text-fg" : "text-fg-muted"}`}>
                        {a.name}
                      </span>
                      <span className="text-fg-subtle">·</span>
                      <span className="inline-flex items-center gap-1 text-fg-muted">
                        <ListTodo size={11} /> {r.code}
                      </span>
                      <span className="grow" />
                      <span className="text-fg-subtle">
                        {new Date(r.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-snug line-clamp-2">{r.body}</p>
                    {r.action_item && <p className="mt-0.5 truncate text-xs text-fg-subtle">{r.action_item}</p>}
                  </Panel>
                </Link>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
