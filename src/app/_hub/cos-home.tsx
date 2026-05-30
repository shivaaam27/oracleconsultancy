import type { TaskRow } from "@/lib/queries";
import { computeGlobalKpis } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { getAppSettings } from "@/lib/settings";
import { WelcomeHero } from "@/components/welcome-hero";
import { AttentionList } from "@/components/attention-list";
import type { AttnItem } from "@/components/attention-panel";

/**
 * One short, human insight — not a count dump (the stat chips already show
 * the numbers). Points the operator at where to look first.
 */
function buildPulse(rows: TaskRow[]): string {
  const k = computeGlobalKpis(rows);
  const heat = new Map<string, number>();
  for (const r of rows) {
    if (!isOpen(r.status)) continue;
    if (r.flag === "overdue" || r.flag === "escalate-now" || r.priority === "Critical")
      heat.set(r.companyName, (heat.get(r.companyName) ?? 0) + 1);
  }
  const hotspot = [...heat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (k.overdue === 0 && k.critical === 0) return "Everything's on track today. 🎉";
  if (hotspot) return `${hotspot} needs the most attention today.`;
  return "A few items need a look today.";
}

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

export async function CosHome({ rows }: { rows: TaskRow[] }) {
  const settings = await getAppSettings();
  const k = computeGlobalKpis(rows);
  const isOpenRow = (r: TaskRow) => r.status !== "Completed" && r.status !== "Closed";

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const dueToday = rows.filter((r) => isOpenRow(r) && r.deadline && r.deadline >= todayStart && r.deadline <= todayEnd).length;

  // The one focused list: anything genuinely needing attention, most urgent first.
  const attention = rows
    .filter((r) =>
      r.flag === "escalate-now" || r.flag === "overdue" || r.flag === "escalated" ||
      r.flag === "stalled" || r.status === "Escalated" || r.escalation === "Yes" ||
      (r.flag === "due-soon") || (r.priority === "Critical" && isOpenRow(r))
    )
    .sort((a, b) => {
      const pa = PRIORITY_ORDER.indexOf(a.priority), pb = PRIORITY_ORDER.indexOf(b.priority);
      const da = typeof a.daysToDeadline === "number" ? a.daysToDeadline : 9999;
      const db = typeof b.daysToDeadline === "number" ? b.daysToDeadline : 9999;
      if (da !== db) return da - db;
      return pa - pb;
    });

  const attnItems: AttnItem[] = attention.map((r) => ({
    code: r.code, actionItem: r.actionItem, companyName: r.companyName,
    status: r.status, flag: r.flag, priority: r.priority,
    deadlineTs: r.deadline ? r.deadline.getTime() : null,
    updatedTs: r.lastUpdatedAt ? r.lastUpdatedAt.getTime() : null,
    latestUpdate: r.latestUpdate,
  }));

  const stats = [
    { label: "Open", value: k.open, href: "/?tab=tasks&all=1" },
    { label: "Due today", value: dueToday, href: "/?tab=tasks&flag=due-soon", tone: "warn" as const },
    { label: "Overdue", value: k.overdue, href: "/?tab=tasks&flag=overdue", tone: "danger" as const },
    { label: "Critical", value: k.critical, href: "/?tab=tasks&priority=Critical", tone: "danger" as const },
  ];

  return (
    <div className="space-y-4">
      <WelcomeHero
        pulse={buildPulse(rows)}
        city={settings.weatherCity}
        lat={settings.weatherLat}
        lon={settings.weatherLon}
        stats={stats}
      />
      <AttentionList items={attnItems} swipeRight={settings.swipeRightAction} swipeLeft={settings.swipeLeftAction} />
    </div>
  );
}
