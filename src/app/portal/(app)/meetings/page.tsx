import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal-auth";
import { portalCapabilities } from "@/lib/portal-capabilities";
import { getScopedPickerData, type PickerPerson, type PickerCompany } from "@/lib/portal-picker";
import { scopedUpcomingMeetings } from "@/lib/portal-meetings-data";
import { listEventCategories } from "@/lib/event-categories";
import { getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { Hero, Panel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { PortalMeetingsPage } from "@/components/portal-meetings-page";
import { PortalBriefings } from "@/components/portal-briefings";
import { AnnouncementFeed } from "@/components/announcement-feed";

export const dynamic = "force-dynamic";

/** Briefings — the meetings/events agenda AND the announcements board in one
 *  place. Two tabs: Meetings (default; badge = meetings within 3 days) and
 *  Announcements (badge = still-unacknowledged). ?tab=announcements deep-links
 *  the second tab (the board's announcement banner "Open" lands here). */
export default async function PortalBriefingsRoute({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const { tab } = await searchParams;
  const initialTab = tab === "announcements" ? "announcements" : "meetings";

  const caps = portalCapabilities(me.portalRole);
  const [meetings, categories, picker, audienceAttrs] = await Promise.all([
    scopedUpcomingMeetings(me),
    listEventCategories(),
    caps.canCreate ? getScopedPickerData(me) : Promise.resolve({ companies: [] as PickerCompany[], people: [] as PickerPerson[] }),
    getPersonAudienceAttrs(me.id),
  ]);
  const announcements = audienceAttrs ? await feedForPerson(audienceAttrs) : [];

  // Badges: meetings starting within 3 days · announcements still needing the
  // viewer (ack-required & not acked, or non-ack & unseen).
  const soonCutoff = Date.now() + 3 * 86400000;
  const meetingsSoon = meetings.filter((m) => {
    const t = new Date(m.startAt).getTime();
    return !Number.isNaN(t) && t <= soonCutoff;
  }).length;
  const unacked = announcements.filter((a) => (a.requireAck ? !a.ackAt : !a.seenAt)).length;

  // Company filter options from the companies present in the viewer's meetings.
  const companyMap = new Map<number, string>();
  for (const m of meetings) if (m.companyId != null && m.companyName) companyMap.set(m.companyId, m.companyName);
  const companies = [...companyMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-5">
      <Hero
        title="Briefings"
        subtitle="Your upcoming meetings and the latest announcements, in one place."
      />
      <Reveal>
        <PortalBriefings
          meetingsCount={meetingsSoon}
          announcementsCount={unacked}
          initialTab={initialTab}
          meetings={
            <PortalMeetingsPage
              meetings={meetings}
              companies={companies}
              categories={categories}
              canCreate={caps.canCreate}
              pickerPeople={picker.people}
              pickerCompanies={picker.companies}
            />
          }
          announcements={
            announcements.length > 0 ? (
              <AnnouncementFeed items={announcements} />
            ) : (
              <Panel className="p-6 text-center text-sm text-fg-muted">No announcements right now.</Panel>
            )
          }
        />
      </Reveal>
    </div>
  );
}
