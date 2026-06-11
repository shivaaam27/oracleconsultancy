import type { TaskRow } from "@/lib/queries";
import { getAppSettings } from "@/lib/settings";
import { recordHealthPoint, getHealthSeries } from "@/lib/health-history";
import { gatherHomeSignals } from "@/lib/signals";
import { listDocuments } from "@/lib/documents";
import { previewMorningPlan } from "@/lib/automation-suggestions";
import { HomeActions } from "./home-actions";
import type { Todo } from "@/app/todos/actions";
import { HomeMissionControl } from "@/components/home-mission-control";

function greeting(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

function dayLabel(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function CosHome({ rows, todos = [] }: { rows: TaskRow[]; todos?: Todo[] }) {
  const now = new Date();
  const [settings, signals, documents] = await Promise.all([
    getAppSettings(),
    gatherHomeSignals(rows, todos),
    listDocuments(),
  ]);
  const morningPlan = await previewMorningPlan(rows, documents);

  // Persist today's health so the gauge can show a real "vs last reading"
  // delta. Returns the most recent earlier-day value (null on the first day).
  const prevHealth = await recordHealthPoint(signals.health);
  const healthDelta = prevHealth === null ? null : signals.health - prevHealth;
  const healthSeries = await getHealthSeries(14);

  // Top to-dos for the Home column: open only, important first, then soonest due.
  const topTodos = todos
    .filter((t) => !t.done)
    .sort((a, b) => {
      if (a.important !== b.important) return a.important ? -1 : 1;
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return ad - bd;
    })
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      title: t.title,
      important: t.important,
      dueAt: t.dueAt,
      context: t.companyName ?? t.personName ?? t.taskCode ?? null,
    }));

  return (
    <div className="space-y-4">
      <HomeActions />
      <HomeMissionControl
        greeting={greeting(now.getHours())}
        dateLabel={`${dayLabel(now)} · ${settings.weatherCity}`}
        command={signals.command}
        pulse={signals.pulse}
        queue={signals.queue}
        health={signals.health}
        healthStats={signals.healthStats}
        healthDelta={healthDelta}
        companyGauges={signals.companyGauges}
        clearedToday={signals.clearedToday}
        weather={{ city: settings.weatherCity, lat: settings.weatherLat, lon: settings.weatherLon }}
        morningPlan={morningPlan}
        healthSeries={healthSeries}
        topTodos={topTodos}
      />
    </div>
  );
}
