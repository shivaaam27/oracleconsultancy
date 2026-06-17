import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal-auth";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sb } from "@/db/supabase";
import Link from "next/link";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { Users, ChevronRight } from "lucide-react";
import { RemindButton } from "./remind-button";
import { WhatsAppButton } from "./whatsapp-button";
import { waLink } from "@/lib/outbox/links";
import { buildWhatsAppManualMessage } from "@/lib/outbox/gen";
import { waReminderLink, waFromLabel } from "@/lib/wa-card";

export const dynamic = "force-dynamic";

/** Team view — Director / Manager / Admin see every staff member with open tasks
 *  and can send each a branded email reminder. Reuses the shared reminder engine. */
export default async function PortalTeamPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole === "staff") redirect("/portal");

  const tasks = (await getAllTasks()).filter((t) => isOpen(t.status));
  const byPerson = new Map<number, typeof tasks>();
  for (const t of tasks) for (const pid of t.assigneeIds) {
    const l = byPerson.get(pid) ?? [];
    l.push(t);
    byPerson.set(pid, l);
  }

  // Reminders sent from here are "from" the signed-in director/manager.
  const fromLabel = waFromLabel({ name: me.name, role: me.portalRole });
  const ids = [...byPerson.keys()];
  const { data: people } = ids.length
    ? await sb.from("people").select("id,name,email,whatsapp,phone").in("id", ids).eq("active", true)
    : { data: [] as { id: number; name: string; email: string | null; whatsapp: string | null; phone: string | null }[] };

  const rows = (people ?? [])
    .map((p) => {
      const ts = (byPerson.get(p.id as number) ?? []).sort((a, b) => {
        const oa = a.flag === "overdue" || a.flag === "escalate-now" ? 0 : 1;
        const ob = b.flag === "overdue" || b.flag === "escalate-now" ? 0 : 1;
        return oa - ob;
      });
      const overdue = ts.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length;
      // Clean plain-text message for the manual wa.me tap-send (markdown shows
      // literally in the compose box; long text breaks WhatsApp Web). The Twilio
      // auto-send path uses the richer markdown card + image separately.
      const waText = buildWhatsAppManualMessage(p.name as string, ts, waReminderLink(p.id as number, fromLabel));
      const waNumber = ((p.whatsapp as string | null) || (p.phone as string | null)) ?? null;
      return {
        id: p.id as number,
        name: p.name as string,
        hasEmail: !!((p.email as string | null) ?? "").trim(),
        waHref: waLink(waNumber, waText),
        open: ts.length,
        overdue,
        tasks: ts,
      };
    })
    .filter((r) => r.open > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <SectionLabel icon={<Users size={13} />}>Team · staff with open tasks</SectionLabel>
      <p className="-mt-1 px-1 text-xs text-fg-muted">
        Send any teammate a branded reminder of their open tasks — overdue work is flagged. You can add a personal line.
      </p>

      {rows.length === 0 ? (
        <Panel className="p-6 text-center text-sm text-fg-muted">No open tasks across the team right now.</Panel>
      ) : (
        rows.map((r, i) => (
          <Reveal key={r.id} delay={Math.min(i * 0.02, 0.2)}>
            <Panel className="space-y-3 p-4">
              <Link href={`/portal/people/${r.id}`} className="group -m-1 flex items-start justify-between gap-3 rounded-xl p-1 transition-colors hover:bg-bg-subtle/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium group-hover:text-accent">{r.name}</p>
                  <p className="mt-0.5 text-[11px] text-fg-muted">
                    {r.open} open{r.overdue > 0 && <span className="text-danger"> · {r.overdue} overdue</span>}
                  </p>
                </div>
                <ChevronRight size={15} className="mt-0.5 shrink-0 text-fg-subtle transition-colors group-hover:text-accent" />
              </Link>

              <ul className="space-y-1 text-xs text-fg-muted">
                {r.tasks.slice(0, 5).map((t) => {
                  const od = t.flag === "overdue" || t.flag === "escalate-now";
                  return (
                    <li key={t.id} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${od ? "bg-danger" : "bg-border-strong"}`} />
                      <span className="truncate">{t.actionItem}</span>
                      <span className="ml-auto shrink-0 text-fg-subtle">{t.companyName}</span>
                    </li>
                  );
                })}
                {r.tasks.length > 5 && <li className="pl-3.5 text-fg-subtle">+{r.tasks.length - 5} more</li>}
              </ul>

              <div className="flex flex-wrap items-center gap-2">
                <RemindButton personId={r.id} personName={r.name} hasEmail={r.hasEmail} />
                <WhatsAppButton personId={r.id} personName={r.name} waHref={r.waHref} />
              </div>
            </Panel>
          </Reveal>
        ))
      )}
    </div>
  );
}
