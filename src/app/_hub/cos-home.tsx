import type { TaskRow } from "@/lib/queries";
import { getAppSettings, getEmailConfig } from "@/lib/settings";
import { sb } from "@/db/supabase";
import { getAutomationConfig } from "@/lib/automation";
import { recordHealthPoint } from "@/lib/health-history";
import { gatherHomeSignals } from "@/lib/signals";
import { CommandWall } from "@/components/command-wall";
import { CommandBar } from "@/components/command-bar";
import { CockpitHero, type HeroKpi, type HeroPill } from "@/components/cockpit-hero";
import { CommandControls, type CommandControlsState } from "@/components/command-controls";
import { CockpitNow } from "@/components/cockpit-now";
import { CockpitActivity } from "@/components/cockpit-activity";
import { listRecentActivity } from "@/lib/activity";
import { gatherCockpitNow } from "@/lib/cockpit-now";
import { listApprovals, listCockpitActivity } from "@/lib/cockpit";
import { HomeAutonomyRecap } from "@/components/home-autonomy-recap";
import type { Tone } from "@/components/surface-kit";
import { HomeActions } from "./home-actions";
import { AnnouncementAdminBanner } from "@/components/announcement-admin-banner";
import type { Todo } from "@/app/todos/actions";

function greeting(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

export async function CosHome({ rows, todos = [] }: { rows: TaskRow[]; todos?: Todo[] }) {
  const now = new Date();
  const [settings, signals, automation, emailCfg, dirRow, activity, nowData, approvals] = await Promise.all([
    getAppSettings(),
    gatherHomeSignals(rows, todos),
    getAutomationConfig(),
    getEmailConfig(),
    sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle(),
    listRecentActivity(8),
    gatherCockpitNow(),
    listApprovals(),
  ]);
  // What ORI did on its own (auto-filed / renamed / verified…) — a slim,
  // trust-building recap; the full undoable feed lives on /inbox.
  const autonomy = await listCockpitActivity(12);

  // The command levers — live state of the operation's automation, outreach and AI.
  const controls: CommandControlsState = {
    automationPaused: automation.paused,
    automationRulesOn: Object.values(automation.categories).filter((c) => c.mode !== "off").length,
    directorOutreachPaused: (dirRow.data?.value as string | null) === "1",
    aiEnabled: settings.aiEnabled,
    emailConnected: emailCfg !== null,
    emailTestMode: emailCfg?.testMode ?? false,
    pendingApprovals: approvals.length,
  };

  // Persist today's health so the ring can show a real "vs last reading" delta.
  const prevHealth = await recordHealthPoint(signals.health);
  const healthDelta = prevHealth === null ? null : signals.health - prevHealth;

  // Hero figures, pulled from the already-computed signals.
  const pulse = (label: string) => signals.pulse.find((p) => p.label === label)?.value ?? 0;
  const open = pulse("Open tasks");
  const overdue = pulse("Overdue");
  const dueToday = pulse("Due today");
  const draftCount = signals.queue.filter((q) => q.group === "draft").length;

  const health = signals.health;
  const healthTone: Tone = health >= 80 ? "success" : health >= 55 ? "warn" : "danger";
  const band = health >= 80 ? "healthy" : health >= 55 ? "watch" : "at risk";
  const healthSub =
    healthDelta === null || healthDelta === 0
      ? band
      : `${band} · ${healthDelta > 0 ? "up" : "down"} ${Math.abs(healthDelta)}% vs last`;

  // ORI's one-line read of the day — deterministic from signals (AI-off safe).
  const focus = signals.command.slice(0, 3).map((c) => c.title);
  const oriLine = focus.length
    ? `Here's where I'd look — ${focus.join(" · ")}.`
    : "Everything's running — the desk is clear.";

  const kpis: HeroKpi[] = [
    { label: "Open", value: open, href: "/?tab=tasks" },
    { label: "Overdue", value: overdue, tone: overdue > 0 ? "danger" : undefined, href: "/?tab=tasks&flag=overdue" },
    { label: "People", value: nowData.headcount, href: "/people" },
  ];

  const pills: HeroPill[] = [];
  if (nowData.pendingLeave > 0) pills.push({ label: `Approve ${nowData.pendingLeave} leave`, href: "/hrms/leave", tone: "warn" });
  if (draftCount > 0) pills.push({ label: `Send ${draftCount} draft${draftCount === 1 ? "" : "s"}`, href: "/outbox", tone: "warn" });
  if (overdue > 0) pills.push({ label: `${overdue} overdue`, href: "/?tab=tasks&flag=overdue", tone: "danger" });

  return (
    <CommandWall>
      <div className="space-y-4">
        <HomeActions />
        <AnnouncementAdminBanner />
        <CommandBar />
        <CockpitHero
          greeting={greeting(now.getHours())}
          name={settings.operatorName}
          health={health}
          healthTone={healthTone}
          healthSub={healthSub}
          oriLine={oriLine}
          kpis={kpis}
          pills={pills}
        />
        <CommandControls state={controls} />
        <HomeAutonomyRecap items={autonomy} />
        <CockpitNow now={nowData} dueToday={dueToday} />
        <CockpitActivity items={activity} />
      </div>
    </CommandWall>
  );
}
