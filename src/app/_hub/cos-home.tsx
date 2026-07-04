import type { TaskRow } from "@/lib/queries";
import { getAppSettings, getEmailConfig } from "@/lib/settings";
import { sb } from "@/db/supabase";
import { getAutomationConfig } from "@/lib/automation";
import { recordHealthPoint } from "@/lib/health-history";
import { gatherHomeSignals } from "@/lib/signals";
import { getGivenName, getInitials } from "@/lib/names";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { CommandWall } from "@/components/command-wall";
import { CommandBar } from "@/components/command-bar";
import { CommandHero } from "@/components/command-hero";
import { CommandRooms, CompanyHeat, NeedsYou, type HeatTile, type NeedsYouItem, type Room } from "@/components/command-deck";
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

/* The Command Centre home — "Mission Deck + Rooms" composition (owner-approved,
 * memory/command_centre_unification.md): hero strip → deck (Needs-you | heat +
 * levers) → live rooms → ORI recap → Now → activity. Presentational over the
 * same loaders as before; the health ring was retired (health is a figure in
 * the hero pill). */

function greeting(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

const DAY_MS = 86_400_000;
const OPEN_EXCLUDED = new Set(["Completed", "Closed"]);

/** Whole days late (>0) or null when not overdue. */
function daysLate(deadline: Date | null, now: number): number | null {
  if (!deadline) return null;
  const d = Math.floor((now - deadline.getTime()) / DAY_MS);
  return d > 0 ? d : null;
}

/** Whole days until due (0 = today) or null when past/absent. */
function daysUntil(deadline: Date | null, now: number): number | null {
  if (!deadline) return null;
  const d = Math.ceil((deadline.getTime() - now) / DAY_MS);
  return d >= 0 ? d : null;
}

export async function CosHome({ rows, todos = [] }: { rows: TaskRow[]; todos?: Todo[] }) {
  const now = new Date();
  const [settings, signals, automation, emailCfg, dirRow, activity, nowData, approvals, companiesRes, docCountRes, docReviewRes, pipeRes] =
    await Promise.all([
      getAppSettings(),
      gatherHomeSignals(rows, todos),
      getAutomationConfig(),
      getEmailConfig(),
      sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle(),
      listRecentActivity(8),
      gatherCockpitNow(),
      listApprovals(),
      sb.from("companies").select("id,name,accent_color"),
      sb.from("documents").select("id", { count: "exact", head: true }).eq("archived", false),
      sb.from("documents").select("id", { count: "exact", head: true }).eq("archived", false).eq("review_status", "needs_review"),
      sb.from("pipeline").select("id", { count: "exact", head: true }).neq("stage", "Issued"),
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

  // Persist today's health so the hero can show a real "vs last reading" delta.
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

  /* ---------- Deck: Needs-you (worst first) + company heat ---------- */
  const nowMs = now.getTime();
  const openRows = rows.filter((r) => !OPEN_EXCLUDED.has(r.status));

  const lateRows = openRows
    .map((r) => ({ r, late: daysLate(r.deadline, nowMs) }))
    .filter((x): x is { r: TaskRow; late: number } => x.late !== null)
    .sort((a, b) => b.late - a.late);
  const soonRows = openRows
    .map((r) => ({ r, in: daysUntil(r.deadline, nowMs) }))
    .filter((x): x is { r: TaskRow; in: number } => x.in !== null && x.in <= 3)
    .sort((a, b) => a.in - b.in);

  const needsYou: NeedsYouItem[] = [
    ...lateRows.map(({ r, late }) => ({
      code: r.code,
      title: r.actionItem,
      meta: `${r.companyName}${r.owner ? ` · ${r.owner}` : r.assignees[0] ? ` · ${r.assignees[0]}` : ""}`,
      badge: `${late}d`,
      tone: "danger" as const,
    })),
    ...soonRows.map(({ r, in: d }) => ({
      code: r.code,
      title: r.actionItem,
      meta: `${r.companyName}${r.owner ? ` · ${r.owner}` : r.assignees[0] ? ` · ${r.assignees[0]}` : ""}`,
      badge: d === 0 ? "today" : `in ${d}d`,
      tone: "warn" as const,
    })),
  ].slice(0, 20);

  // Per-company heat — EVERY company gets a logo tile (the portal HealthPanel
  // twin): red = overdue, amber = due within 3 days, green = calm. Worst-first,
  // then most open work; the grid scroll-houses to the Needs-you column's height.
  const byCompany = new Map<number, { open: number; overdue: number; worstLate: number; soonest: number | null }>();
  for (const r of openRows) {
    const e = byCompany.get(r.companyId) ?? { open: 0, overdue: 0, worstLate: 0, soonest: null };
    e.open += 1;
    const late = daysLate(r.deadline, nowMs);
    if (late !== null) {
      e.overdue += 1;
      e.worstLate = Math.max(e.worstLate, late);
    } else {
      const d = daysUntil(r.deadline, nowMs);
      if (d !== null && d <= 3) e.soonest = e.soonest === null ? d : Math.min(e.soonest, d);
    }
    byCompany.set(r.companyId, e);
  }
  const companies = companiesRes.data ?? [];
  const logoMap = await getCompanyLogoMap();
  const heatTiles: HeatTile[] = companies
    .map((c) => {
      const id = c.id as number;
      const e = byCompany.get(id) ?? { open: 0, overdue: 0, worstLate: 0, soonest: null };
      const tone = e.overdue > 0 ? ("danger" as const) : e.soonest !== null ? ("warn" as const) : ("success" as const);
      const note =
        e.overdue > 0
          ? `${e.overdue} overdue · worst ${e.worstLate}d late`
          : e.soonest !== null
            ? e.soonest === 0
              ? "due today"
              : `due in ${e.soonest}d`
            : e.open === 0
              ? "No open tasks"
              : `${e.open} open · on track`;
      return {
        companyId: id,
        name: c.name as string,
        logoUrl: logoMap.get(id) ?? null,
        accent: (c.accent_color as string | null) ?? null,
        open: e.open,
        overdue: e.overdue,
        note,
        tone,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || (b.tone === "warn" ? 1 : 0) - (a.tone === "warn" ? 1 : 0) || b.open - a.open);

  /* ---------- Rooms — the live house ---------- */
  const docCount = docCountRes.count ?? 0;
  const docReview = docReviewRes.count ?? 0;
  const pipeCount = pipeRes.count ?? 0;
  const firstEvent = nowData.events[0];
  const rooms: Room[] = [
    {
      key: "tasks",
      label: "Tasks",
      count: open,
      suffix: overdue > 0 ? `· ${overdue} late` : undefined,
      heartbeat: dueToday > 0 ? `${dueToday} due today` : "nothing due today",
      href: "/?tab=tasks",
      tone: overdue > 0 ? "danger" : dueToday > 0 ? "warn" : "success",
    },
    {
      key: "approvals",
      label: "Approvals",
      count: approvals.length,
      heartbeat: draftCount > 0 ? `${draftCount} draft${draftCount === 1 ? "" : "s"} ready to send` : "nothing waiting on you",
      href: "/approvals",
      tone: approvals.length > 0 ? "warn" : "success",
    },
    {
      key: "people",
      label: "People",
      count: nowData.headcount,
      heartbeat:
        nowData.pendingLeave > 0
          ? `${nowData.pendingLeave} leave to approve`
          : nowData.onLeaveToday > 0
            ? `${nowData.onLeaveToday} on leave today`
            : "everyone's in",
      href: "/people",
      tone: nowData.pendingLeave > 0 ? "warn" : "success",
    },
    {
      key: "calendar",
      label: "Calendar",
      count: nowData.events.length,
      heartbeat: firstEvent ? firstEvent.title : "clear today",
      href: "/calendar",
      tone: "success",
    },
    {
      key: "documents",
      label: "Documents",
      count: docCount,
      heartbeat: docReview > 0 ? `${docReview} to review` : "all filed",
      href: "/documents",
      tone: docReview > 0 ? "warn" : "success",
    },
    {
      key: "pipeline",
      label: "Pipeline",
      count: pipeCount,
      heartbeat: pipeCount > 0 ? "applications in flight" : "nothing in flight",
      href: "/hrms/pipeline",
      tone: pipeCount > 0 ? "warn" : "success",
    },
  ];

  const operator = settings.operatorName || "Chief";
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

  return (
    <CommandWall>
      <div className="space-y-4">
        <HomeActions />
        <AnnouncementAdminBanner />
        <CommandBar />
        <CommandHero
          greeting={greeting(now.getHours())}
          name={getGivenName(operator)}
          initials={getInitials(operator)}
          subtitle={`${dateLabel} · ${companies.length} companies · ${nowData.headcount} people`}
          open={open}
          overdue={overdue}
          dueToday={dueToday}
          health={health}
          healthTone={healthTone}
          healthSub={healthSub}
          oriLine={oriLine}
          pendingApprovals={approvals.length}
        />

        {/* The deck — Needs-you beside the full company heat wall (equal-height
            scroll housings; controls live further down beside the activity feed). */}
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <NeedsYou items={needsYou} totalOverdue={overdue} />
          <CompanyHeat tiles={heatTiles} />
        </div>

        {/* The rooms — every area of the house, breathing. */}
        <CommandRooms rooms={rooms} />

        <HomeAutonomyRecap items={autonomy} />
        <CockpitNow now={nowData} dueToday={dueToday} />

        {/* The pulse + the levers, side by side. */}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <CockpitActivity items={activity} />
          <CommandControls state={controls} />
        </div>
      </div>
    </CommandWall>
  );
}
