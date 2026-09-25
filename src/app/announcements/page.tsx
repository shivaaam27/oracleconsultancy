import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { sb } from "@/db/supabase";
import { directReportIds, isScopedDirector } from "@/lib/portal-auth";
import { listAnnouncements, receiptStats, getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { ANNOUNCEMENT_TYPES, audienceLabel, isLive, isScheduled, type AudienceKind } from "@/lib/announcements-shared";
import { getSitesAdmin } from "@/lib/sites";
import { listRoleNames } from "@/lib/roles";
import { PERSON_TYPES, PERSON_TYPE_LABELS } from "@/lib/person-types";
import { StudioAnnouncements, type NoticeRow } from "@/components/studio/announcements/studio-announcements";
import { AuthorAnnouncements } from "@/components/studio/announcements/author-announcements";

export const dynamic = "force-dynamic";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const TYPE_LABEL = new Map(ANNOUNCEMENT_TYPES.map((t) => [t.value, t.label]));

/**
 * Announcements — Studio (26 Sept 2026, boards Announcements / M_Announcements).
 * The owner: the whole noticeboard. A director or manager: the notices meant for
 * them, and posting to their own people (they saw "being rebuilt" until now).
 */
export default async function AnnouncementsPage() {
  const v = await getViewer();
  if (!v) redirect("/login");

  if (v.kind === "director") {
    const me = v.person;
    const attrs = await getPersonAudienceAttrs(me.id);
    const feed = attrs ? await feedForPerson(attrs) : [];
    // Who they may post to: a manager — their company and their team; a
    // director — their companies and the people in them.
    let companyIds: number[] = [];
    let peopleIds: number[] = [];
    if (me.portalRole === "manager") {
      companyIds = me.companyId != null ? [me.companyId] : [];
      peopleIds = [me.id, ...(await directReportIds(me.id))];
    } else {
      companyIds = isScopedDirector(me) ? me.directorCompanyIds : (v.scope ?? []);
    }
    const [{ data: cos }, { data: ppl }] = await Promise.all([
      companyIds.length ? sb.from("companies").select("id,name").in("id", companyIds).order("name") : sb.from("companies").select("id,name").eq("active", true).order("name"),
      peopleIds.length ? sb.from("people").select("id,name").in("id", peopleIds).eq("active", true).order("name") : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    ]);
    const lists = {
      companies: (cos ?? []).map((c) => ({ value: String(c.id), label: c.name as string })),
      departments: [], sites: [], roles: [], personTypes: [],
      people: (ppl ?? []).map((p) => ({ value: String(p.id), label: p.name as string })),
    };
    const allowedKinds: AudienceKind[] = me.portalRole === "manager" ? ["company", "people"] : ["company"];
    const reach = me.portalRole === "manager" ? "your company and your team" : isScopedDirector(me) ? "your companies" : "every company";
    return <AuthorAnnouncements feed={feed} lists={lists} allowedKinds={allowedKinds} reach={reach} />;
  }

  const [{ data: companiesRaw }, { data: deptsRaw }, sites, { data: peopleRaw }, roles, announcements] = await Promise.all([
    sb.from("companies").select("id,name").order("name"),
    sb.from("departments").select("id,name").order("name"),
    getSitesAdmin(),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    listRoleNames(),
    listAnnouncements(true),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const departments = (deptsRaw ?? []).map((d) => ({ id: d.id as number, name: d.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const maps = {
    companies: new Map(companies.map((c) => [c.id, c.name])),
    departments: new Map(departments.map((d) => [d.id, d.name])),
    sites: new Map(sites.map((s) => [s.id, s.name])),
    people: new Map(people.map((p) => [p.id, p.name])),
  };
  const lists = {
    companies: companies.map((c) => ({ value: String(c.id), label: c.name })),
    departments: departments.map((d) => ({ value: String(d.id), label: d.name })),
    sites: sites.map((s) => ({ value: String(s.id), label: s.name })),
    roles: roles.map((r) => ({ value: r, label: r })),
    personTypes: PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE_LABELS[t] })),
    people: people.map((p) => ({ value: String(p.id), label: p.name })),
  };

  const now = new Date();
  const rows: NoticeRow[] = await Promise.all(announcements.map(async (a) => {
    const lane: NoticeRow["lane"] = a.status === "draft" ? "drafts" : a.status === "archived" ? "arch" : isScheduled(a, now) ? "sched" : isLive(a, now) ? "live" : "arch";
    const stats = lane === "live" || lane === "arch" ? await receiptStats(a) : { seen: 0, ack: 0, total: 0 };
    return {
      id: a.id, title: a.title, body: a.body, typeLabel: TYPE_LABEL.get(a.type) ?? a.type, lane,
      pinned: a.pinned, requireAck: a.requireAck, takeover: a.takeover,
      audienceText: audienceLabel(a, maps),
      whenLabel: `since ${fmt(a.publishedAt ?? a.createdAt)}`,
      subLabel: lane === "sched" ? `Goes live ${fmtAt(a.publishAt)}` : lane === "drafts" ? `Draft · ${fmt(a.createdAt)}` : `${fmt(a.publishedAt ?? a.createdAt)} · ${a.expiresAt ? `until ${fmt(a.expiresAt)}` : "no expiry"}`,
      stats,
    };
  }));
  // Pinned first, then newest.
  rows.sort((x, y) => Number(y.pinned) - Number(x.pinned));
  return <StudioAnnouncements rows={rows} lists={lists} />;
}
