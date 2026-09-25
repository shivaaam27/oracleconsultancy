import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AnnouncementComposer, type Opt } from "@/components/announcement-composer";
import { AnnouncementFeed } from "@/components/announcement-feed";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber } from "@/components/studio/kit";
import { getPortalPerson, directReportIds } from "@/lib/portal-auth";
import { feedForPersonId } from "@/lib/announcements";
import type { AudienceKind } from "@/lib/announcements-shared";
import { isStaffLikeRole } from "@/lib/director-routes";

export const dynamic = "force-dynamic";

export default async function PortalAnnouncements() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  // A director is redirected above; a manager posts to their own team.
  const canPost = me.portalRole === "manager";

  // The feed and a manager's composer lists need only `me`, so read them together.
  const [feed, composerData] = await Promise.all([
    feedForPersonId(me.id),
    canPost
      ? (async () => {
          // Manager: only their own company + their direct reports.
          const reports = await directReportIds(me.id);
          const ids = Array.from(new Set([me.id, ...reports]));
          const [{ data: peopleRaw }, { data: companyRaw }] = await Promise.all([
            sb.from("people").select("id,name").in("id", ids.length ? ids : [-1]).eq("active", true).order("name"),
            me.companyId != null ? sb.from("companies").select("id,name").eq("id", me.companyId).maybeSingle() : Promise.resolve({ data: null }),
          ]);
          return { peopleRaw, companyRaw };
        })()
      : Promise.resolve(null),
  ]);

  // Staff (26 Sept 2026): the Studio look — two dark cards, then the feed,
  // which keeps Acknowledge, reactions and comments exactly as they were.
  if (isStaffLikeRole(me.portalRole)) {
    const waiting = feed.filter((a) => (a.requireAck ? !a.ackAt : !a.seenAt));
    const toAck = feed.filter((a) => a.requireAck && !a.ackAt).length;
    const pinned = feed.filter((a) => a.pinned).length;
    return (
      <StudioScope className="flex flex-col gap-5">
        <StudioHeader title="Announcements" />
        <StudioCardRow>
          <StudioCard className="min-h-[170px]">
            <CardHead label="Waiting for you" right={<span>{toAck} to acknowledge</span>} />
            <div className="mt-auto pt-3">
              <BigNumber value={waiting.length} unit={waiting.length === 1 ? "notice" : "notices"} />
              <div className="mt-2 truncate text-[13px] text-[var(--st-on-card-muted)]">{waiting[0] ? waiting[0].title : "You are up to date."}</div>
            </div>
          </StudioCard>
          <StudioCard texture="rings" className="min-h-[170px]">
            <CardHead label="On the board" right={<span>{pinned} pinned</span>} />
            <div className="mt-auto pt-3">
              <BigNumber value={feed.length} unit="live" />
              <div className="mt-2 text-[13px] text-[var(--st-on-card-muted)]">Notices from management for you. Newest first, pinned on top.</div>
            </div>
          </StudioCard>
        </StudioCardRow>
        <section className="st-desk st-panel min-w-0 rounded-[20px] bg-[var(--st-surface)] px-5 py-4">
          <AnnouncementFeed items={feed} />
        </section>
      </StudioScope>
    );
  }
  let composer: React.ReactNode = null;
  if (composerData) {
    {
      const { peopleRaw, companyRaw } = composerData;
      const company = companyRaw as { id: number; name: string } | null;
      const lists = {
        companies: company ? [{ value: String(company.id), label: company.name } satisfies Opt] : [],
        departments: [],
        sites: [],
        roles: [],
        personTypes: [],
        people: (peopleRaw ?? []).map((p) => ({ value: String(p.id), label: p.name as string }) satisfies Opt),
      };
      const allowed: AudienceKind[] = ["company", "people"];
      composer = <AnnouncementComposer mode="portal" lists={lists} allowedKinds={allowed} />;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Reveal delay={0}>
        <Hero title="Announcements" subtitle={canPost ? "Notices for you — and post your own." : "Notices from management."} />
      </Reveal>

      {composer && <Reveal delay={0.04}>{composer}</Reveal>}

      <Reveal delay={0.08} className="flex flex-col gap-2.5">
        <SectionLabel icon={<Megaphone size={13} />}>Latest</SectionLabel>
        <AnnouncementFeed items={feed} />
      </Reveal>
    </div>
  );
}
