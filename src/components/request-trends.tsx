"use client";

import { requestStatusLabel, type RequestTrends } from "@/lib/requests-shared";

function Bars({ title, data }: { title: string; data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="rounded-2xl bg-bg-elev ring-1 ring-border p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">{title}</p>
      {data.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">No data yet.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-xs text-fg">{d.label}</span>
              <div className="h-2 flex-1 rounded-full bg-bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((d.count / max) * 100)}%` }} />
              </div>
              <span className="w-6 shrink-0 text-right text-xs tabular text-fg-muted">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RequestTrendsView({ trends }: { trends: RequestTrends }) {
  const tiles = [
    { label: "Total", value: String(trends.total) },
    { label: "Open", value: String(trends.open) },
    {
      label: "Approval rate",
      value: trends.approvalRate == null ? "—" : `${Math.round(trends.approvalRate * 100)}%`,
    },
    {
      label: "Avg response",
      value:
        trends.avgResponseHours == null
          ? "—"
          : trends.avgResponseHours < 24
            ? `${Math.round(trends.avgResponseHours)}h`
            : `${Math.round(trends.avgResponseHours / 24)}d`,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-bg-subtle/70 p-3">
            <p className="text-[11px] text-fg-muted">{t.label}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular">{t.value}</p>
          </div>
        ))}
      </div>
      <Bars title="By type" data={trends.byCategory} />
      <Bars title="By company" data={trends.byCompany} />
      <Bars
        title="By status"
        data={trends.byStatus.map((d) => ({ label: requestStatusLabel(d.label), count: d.count }))}
      />
    </div>
  );
}
