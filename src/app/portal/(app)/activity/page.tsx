import Link from "next/link";
import { redirect } from "next/navigation";
import { ListTodo, MessageSquare } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel } from "@/components/surface-kit";
import { AutoRefresh } from "@/components/auto-refresh";
import { Reveal } from "@/components/reveal";
import { getPortalPerson, visibleTaskIds } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/** Display name + management flag for a created_by stamp. */
function authorOf(by: string | null, myName: string): { name: string; management: boolean; me: boolean } {
  if (!by) return { name: "System", management: false, me: false };
  if (by.startsWith("portal-dir:")) {
    const n = by.slice(11);
    return { name: n === myName ? "You" : n, management: true, me: n === myName };
  }
  if (by.startsWith("portal-mgr:")) {
    const n = by.slice(11);
    return { name: n === myName ? "You" : n, management: true, me: n === myName };
  }
  if (by.startsWith("portal:")) {
    const n = by.slice(7);
    return { name: n === myName ? "You" : n, management: false, me: n === myName };
  }
  if (by === "ai-command") return { name: "ORI", management: true, me: false };
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
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
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
      <Reveal delay={0}>
        <Hero
          title="Activity"
          subtitle={
            me.portalRole === "director" || me.portalRole === "hr"
              ? "Every update across the group, newest first."
              : me.portalRole === "manager"
                ? "Every update across your company's tasks and your team's."
                : "Every update across your tasks, newest first."
          }
        />
      </Reveal>

      <section className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {groups.length === 0 && (
          <Panel className="p-6 text-center text-sm text-fg-muted">No activity yet.</Panel>
        )}
        {groups.map((g, gi) => (
          <Reveal key={g.label} delay={Math.min(0.04 + gi * 0.04, 0.2)} className="flex flex-col gap-2.5">
            <SectionLabel icon={<MessageSquare size={13} />}>{g.label}</SectionLabel>
            {/* Timeline: a hairline rail with a tone dot per update — management
                = accent, you = info, staff/system = muted. */}
            <ol className="relative ml-1.5 flex flex-col gap-3 border-l border-border/70 pl-5">
              {g.items.map((r) => {
                const a = authorOf(r.created_by, me.name);
                const dot = a.management ? "bg-accent" : a.me ? "bg-info" : "bg-fg-subtle";
                return (
                  <li key={r.id} className="relative">
                    <span className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-bg ${dot}`} />
                    <Link
                      href={`/portal/task/${r.code}`}
                      className="group block rounded-2xl bg-bg-elev p-3.5 ring-1 ring-border transition-all hover:ring-2 hover:ring-accent/30 active:scale-[0.99]"
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
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Reveal>
        ))}
      </section>
    </div>
  );
}
