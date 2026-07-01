import Link from "next/link";

/**
 * ExpiryRadar — a glanceable "next 90 days" ribbon of documents by when they
 * expire, so you SEE the wave coming instead of reading colour-coded flags in a
 * table. Overdue items cluster on the left; the rest sit along a 0–90-day track,
 * colour-coded by urgency; each dot links to its document. Renders nothing when
 * nothing is expiring, so it never adds noise.
 */
export type RadarItem = { id: number; title: string; owner: string | null; days: number; date: string; href: string };

const dot = (d: number) => (d <= 7 ? "bg-danger" : d <= 30 ? "bg-warn" : "bg-accent");

export function ExpiryRadar({ items }: { items: RadarItem[] }) {
  const overdue = items.filter((i) => i.days < 0).sort((a, b) => a.days - b.days);
  const window = items.filter((i) => i.days >= 0 && i.days <= 90).sort((a, b) => a.days - b.days);
  if (overdue.length === 0 && window.length === 0) return null;

  return (
    <div className="rounded-2xl bg-bg-elev/60 ring-1 ring-border p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-medium text-fg">Expiry radar</div>
        <div className="text-[11px] text-fg-subtle">
          {overdue.length > 0 && <span className="text-danger">{overdue.length} overdue</span>}
          {overdue.length > 0 && window.length > 0 && " · "}
          {window.length > 0 && <span>{window.length} in next 90 days</span>}
        </div>
      </div>

      <div className="flex items-stretch gap-3">
        {/* Overdue cluster */}
        {overdue.length > 0 && (
          <Link
            href="/documents?status=expired"
            className="shrink-0 flex flex-col items-center justify-center rounded-xl bg-danger/10 ring-1 ring-danger/30 px-3 py-2 hover:ring-danger/60 transition"
            title={overdue.map((o) => `${o.title} (${Math.abs(o.days)}d ago)`).join("\n")}
          >
            <span className="text-lg font-semibold text-danger leading-none">{overdue.length}</span>
            <span className="text-[10px] uppercase tracking-wider text-danger/80 mt-0.5">Overdue</span>
          </Link>
        )}

        {/* 0–90 day track */}
        <div className="relative flex-1 min-w-0 h-14">
          {/* baseline + ticks */}
          <div className="absolute left-0 right-0 top-6 h-px bg-border" />
          {[0, 30, 60, 90].map((t) => (
            <div key={t} className="absolute top-6 -translate-x-1/2 flex flex-col items-center" style={{ left: `${(t / 90) * 100}%` }}>
              <div className="h-1.5 w-px bg-border" />
              <span className="text-[9px] text-fg-subtle mt-1">{t === 0 ? "Today" : `${t}d`}</span>
            </div>
          ))}
          {/* document markers */}
          {window.map((it, i) => (
            <Link
              key={it.id}
              href={it.href}
              className="absolute -translate-x-1/2 group"
              style={{ left: `${Math.min(98, Math.max(2, (it.days / 90) * 100))}%`, top: `${i % 2 === 0 ? 6 : 30}px` }}
              title={`${it.title}${it.owner ? ` — ${it.owner}` : ""} · expires ${it.date} (${it.days}d)`}
            >
              <span className={`block h-2.5 w-2.5 rounded-full ${dot(it.days)} ring-2 ring-bg-elev group-hover:scale-150 transition`} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
