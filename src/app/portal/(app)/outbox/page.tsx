import { redirect } from "next/navigation";
import { getPortalPerson, isGroupWide, managerTeamIds } from "@/lib/portal-auth";
import { sb } from "@/db/supabase";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { PortalOutboxList, type OutboxRow } from "./portal-outbox-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outbox — Oracle Consultancy" };

/** Portal Outbox — a READ-ONLY view of outreach (reminders and messages) that has
 *  gone out or sits drafted. Management-only: a director/HR sees every row across
 *  the group; a manager sees only rows tied to a person on their own team. There
 *  are deliberately NO send / resend / delete actions here — this is a visibility
 *  surface so management can see at a glance what's been sent and what's still a
 *  draft. (Composing/sending stays on the admin side.) */
export default async function PortalOutboxPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole === "staff") redirect("/portal"); // management only

  const groupWide = isGroupWide(me.portalRole);

  let rows: OutboxRow[] = [];
  // A manager is scoped to their own team. With an empty team we must NOT fall
  // through to "all rows" — show nothing instead. Group-wide roles see everything.
  let team: number[] | null = null;
  if (!groupWide) {
    team = await managerTeamIds(me);
  }

  if (groupWide || (team && team.length > 0)) {
    let q = sb
      .from("outbox")
      // Only the columns the list actually renders — recipient_contact (a personal
      // phone/email) and source are deliberately not fetched on this read-only screen.
      .select(
        "id,channel,recipient_name,company,subject,body,message_type,status,person_id,created_at,sent_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (team) q = q.in("person_id", team); // rows with a null person_id are intentionally excluded for managers
    const { data } = await q;
    rows = (data ?? []).map((r) => ({
      id: r.id as number,
      channel: ((r.channel as string | null) ?? "").toUpperCase(),
      recipientName: (r.recipient_name as string | null) ?? "Someone",
      company: (r.company as string | null) ?? null,
      subject: (r.subject as string | null) ?? null,
      body: (r.body as string | null) ?? "",
      messageType: (r.message_type as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      sentAt: (r.sent_at as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  }

  const sent = rows.filter((r) => r.sentAt).length;
  const drafts = rows.length - sent;

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={60} />
      <Reveal delay={0}>
        <Hero
          title="Outbox"
          subtitle="Reminders and messages — what's gone out and what's still drafted."
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-baseline gap-1.5 rounded-2xl bg-bg-elev/60 px-3 py-1.5 ring-1 ring-border">
              <span className="text-xl font-semibold tabular leading-none text-success">{sent}</span>
              <span className="text-xs text-fg-muted">sent</span>
            </span>
            <span className="inline-flex items-baseline gap-1.5 rounded-2xl bg-bg-elev/60 px-3 py-1.5 ring-1 ring-border">
              <span className="text-xl font-semibold tabular leading-none text-fg">{drafts}</span>
              <span className="text-xs text-fg-muted">drafted</span>
            </span>
          </div>
        </Hero>
      </Reveal>

      <Reveal delay={0.05}>
        <PortalOutboxList rows={rows} />
      </Reveal>
    </div>
  );
}
