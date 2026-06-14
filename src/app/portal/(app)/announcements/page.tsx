import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AnnouncementComposer, type Opt } from "@/components/announcement-composer";
import { AnnouncementFeed } from "@/components/announcement-feed";
import { getPortalPerson, directReportIds } from "@/lib/portal-auth";
import { getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { getSitesAdmin } from "@/lib/sites";
import { listRoleNames } from "@/lib/roles";
import { PERSON_TYPES, PERSON_TYPE_LABELS } from "@/lib/person-types";
import type { AudienceKind } from "@/lib/announcements-shared";

export const dynamic = "force-dynamic";

export default async function PortalAnnouncements() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const attrs = await getPersonAudienceAttrs(me.id);
  const feed = attrs ? await feedForPerson(attrs) : [];
  const canPost = me.portalRole === "director" || me.portalRole === "manager";

  let composer: React.ReactNode = null;
  if (canPost) {
    if (me.portalRole === "director") {
      const [{ data: companiesRaw }, { data: deptsRaw }, sites, { data: peopleRaw }, roles] = await Promise.all([
        sb.from("companies").select("id,name").order("name"),
        sb.from("departments").select("id,name").order("name"),
        getSitesAdmin(),
        sb.from("people").select("id,name").eq("active", true).order("name"),
        listRoleNames(),
      ]);
      const lists = {
        companies: (companiesRaw ?? []).map((c) => ({ value: String(c.id), label: c.name as string }) satisfies Opt),
        departments: (deptsRaw ?? []).map((d) => ({ value: String(d.id), label: d.name as string }) satisfies Opt),
        sites: sites.map((s) => ({ value: String(s.id), label: s.name }) satisfies Opt),
        roles: roles.map((r) => ({ value: r, label: r }) satisfies Opt),
        personTypes: PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE_LABELS[t] }) satisfies Opt),
        people: (peopleRaw ?? []).map((p) => ({ value: String(p.id), label: p.name as string }) satisfies Opt),
      };
      composer = <AnnouncementComposer mode="portal" lists={lists} />;
    } else {
      // Manager: only their own company + their direct reports.
      const reports = await directReportIds(me.id);
      const ids = Array.from(new Set([me.id, ...reports]));
      const [{ data: peopleRaw }, { data: companyRaw }] = await Promise.all([
        sb.from("people").select("id,name").in("id", ids.length ? ids : [-1]).eq("active", true).order("name"),
        me.companyId != null ? sb.from("companies").select("id,name").eq("id", me.companyId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
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
