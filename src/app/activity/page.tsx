import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { getActivityFeed, formatDayLabel, formatTimeLabel } from "@/lib/activity-log";
import { ActivityLogView } from "@/components/activity-log-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity log · COS" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const rows = await getActivityFeed({ limit: 150 });
  const now = new Date();
  // Compute display labels server-side so the client renders identical strings
  // (locale-dependent Intl formatting would otherwise mismatch on hydration).
  const serialised = rows.map((r) => ({
    key: r.key, actor: r.actor, actorLabel: r.actorLabel, summary: r.summary, detail: r.detail, href: r.href ?? null,
    dayLabel: formatDayLabel(r.when, now), timeLabel: formatTimeLabel(r.when),
  }));

  return (
    <div className="space-y-5">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Activity log"
        sub="Everything that happened, newest first. Filter to “System” to see exactly what the system did on its own — each with the reason why."
      />
      <ActivityLogView rows={serialised} />
    </div>
  );
}
