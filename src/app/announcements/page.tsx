import { Megaphone } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, SectionLabel, TONE, type Tone } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AnnouncementComposer, type Opt } from "@/components/announcement-composer";
import { AnnouncementAdminList, type AdminAnnouncement } from "@/components/announcement-admin-list";
import { listAnnouncements, receiptStats } from "@/lib/announcements";
import { audienceLabel, isScheduled } from "@/lib/announcements-shared";
import { getSitesAdmin } from "@/lib/sites";
import { listRoleNames } from "@/lib/roles";
import { PERSON_TYPES, PERSON_TYPE_LABELS } from "@/lib/person-types";

export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function AnnouncementsPage() {
  const [{ data: companiesRaw }, { data: deptsRaw }, sites, { data: peopleRaw }, roles, announcements] =
    await Promise.all([
      sb.from("companies").select("id,name").order("name"),
      sb.from("departments").select("id,name").order("name"),
      getSitesAdmin(),
      sb.from("people").select("id,name").eq("active", true).order("name"),
      listRoleNames(),
      listAnnouncements(false),
    ]);

  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const departments = (deptsRaw ?? []).map((d) => ({ id: d.id as number, name: d.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));

  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));
  const peopleMap = new Map(people.map((p) => [p.id, p.name]));

  const lists = {
    companies: companies.map((c) => ({ value: String(c.id), label: c.name }) satisfies Opt),
    departments: departments.map((d) => ({ value: String(d.id), label: d.name }) satisfies Opt),
    sites: sites.map((s) => ({ value: String(s.id), label: s.name }) satisfies Opt),
    roles: roles.map((r) => ({ value: r, label: r }) satisfies Opt),
    personTypes: PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE_LABELS[t] }) satisfies Opt),
    people: people.map((p) => ({ value: String(p.id), label: p.name }) satisfies Opt),
  };

  // Stats per announcement (small list — fine to gather together).
  const withStats = await Promise.all(
    announcements.map(async (a) => {
      const stats = a.status === "published" && !isScheduled(a) ? await receiptStats(a) : { seen: 0, ack: 0, total: 0 };
      const scheduled = isScheduled(a);
      const row: AdminAnnouncement = {
        id: a.id,
        title: a.title,
        body: a.body,
        type: a.type,
        status: a.status,
        pinned: a.pinned,
        requireAck: a.requireAck,
        audienceText: audienceLabel(a, { companies: companyMap, departments: deptMap, sites: siteMap, people: peopleMap }),
        whenLabel: fmt(a.publishedAt ?? a.createdAt),
        scheduledLabel: scheduled ? `Goes live ${fmtDateTime(a.publishAt)}` : null,
        expiresLabel: a.expiresAt ? fmt(a.expiresAt) : null,
        stats,
      };
      return row;
    })
  );

  const publishedCount = announcements.filter((a) => a.status === "published" && !isScheduled(a)).length;
  const draftCount = announcements.filter((a) => a.status === "draft").length;
  const scheduledCount = announcements.filter((a) => isScheduled(a)).length;

  const heroMetrics: { label: string; value: number; tone: Tone }[] = [
    { label: "live", value: publishedCount, tone: publishedCount ? "accent" : "muted" },
    { label: "drafts", value: draftCount, tone: draftCount ? "warn" : "muted" },
    { label: "scheduled", value: scheduledCount, tone: scheduledCount ? "info" : "muted" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Reveal>
        <Hero title="Announcements" subtitle="Post a notice once — it reaches the right people on the portal and here.">
          <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
            {heroMetrics.map((m) => (
              <div key={m.label} className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-semibold tabular ${TONE[m.tone].text}`}>{m.value}</span>
                <span className="text-[11px] text-fg-muted">{m.label}</span>
              </div>
            ))}
          </div>
        </Hero>
      </Reveal>

      <Reveal delay={0.04}>
        <AnnouncementComposer mode="admin" lists={lists} />
      </Reveal>

      <Reveal delay={0.08} className="flex flex-col gap-2.5">
        <SectionLabel icon={<Megaphone size={13} />}>Noticeboard</SectionLabel>
        <AnnouncementAdminList items={withStats} />
      </Reveal>
    </div>
  );
}
