import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { listAccounts, listPostsWithState } from "@/lib/marketing";
import { PLATFORM_LABEL, type Platform } from "@/lib/marketing-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar — Marketing" };

/** Dar es Salaam, always — the month a post belongs to is the local one. */
const TZ = "Africa/Nairobi";
const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

/**
 * The month, and what is planned.
 *
 * ⚠️ IT SHOWS BOTH WHAT IS DUE AND WHAT WENT OUT, on the same grid. A calendar
 * of intentions only is a calendar nobody checks against reality — the gap
 * between the two is the thing worth seeing.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;

  // Which month. `m` is YYYY-MM; default is the current month in Dar.
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : todayKey.slice(0, 7);
  const [year, mon] = month.split("-").map(Number);

  const [posts, accounts] = await Promise.all([listPostsWithState(), listAccounts(true)]);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Everything that has a day in this month, whether planned or done.
  type Entry = { postId: number; title: string; accountId: number; state: "due" | "out" | "missed" | "stopped"; time: string };
  const byDay = new Map<string, Entry[]>();
  for (const p of posts) {
    for (const pub of p.publications) {
      const at = pub.publishedAt ?? pub.plannedFor;
      if (!at) continue;
      const key = dayKey(at);
      if (!key.startsWith(month)) continue;
      const state: Entry["state"] =
        pub.status === "published" ? "out"
        : pub.status === "planned" ? (key < todayKey ? "missed" : "due")
        : "stopped";
      const list = byDay.get(key) ?? [];
      list.push({
        postId: p.id, title: p.title, accountId: pub.accountId, state,
        time: new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
      });
      byDay.set(key, list);
    }
  }

  // The grid. Weeks start on Monday, as they do here.
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = new Date(Date.UTC(year, mon - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 7);
  const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const missed = [...byDay.values()].flat().filter((e) => e.state === "missed").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar"
        sub={label}
        action={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/marketing/calendar?m=${prev}`} className="text-accent">← Previous</Link>
            <Link href={`/marketing/calendar?m=${next}`} className="text-accent">Next →</Link>
          </div>
        }
      />

      {missed > 0 && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {missed} post{missed === 1 ? " was" : "s were"} due earlier this month and {missed === 1 ? "has" : "have"} not
          been marked as out. Either it went and needs recording, or it did not.
        </p>
      )}

      <Card>
        {/* ⚠️ The grid scrolls in its own housing rather than squeezing the day
            columns to nothing on a phone. */}
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 gap-px border-b border-border pb-1.5">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="px-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-border">
              {cells.map((key, i) => {
                const entries = key ? byDay.get(key) ?? [] : [];
                const isToday = key === todayKey;
                return (
                  <div
                    key={i}
                    className={`min-h-[86px] bg-bg-elev p-1.5 ${key ? "" : "opacity-40"} ${isToday ? "ring-1 ring-inset ring-accent" : ""}`}
                  >
                    {key && (
                      <div className={`mb-1 text-xs ${isToday ? "font-semibold text-accent" : "text-fg-subtle"}`}>
                        {Number(key.slice(-2))}
                      </div>
                    )}
                    <div className="space-y-1">
                      {entries.map((e, j) => {
                        const a = accountById.get(e.accountId);
                        const cls =
                          e.state === "out" ? "bg-success-soft text-success"
                          : e.state === "missed" ? "bg-danger-soft text-danger"
                          : e.state === "stopped" ? "bg-bg-subtle text-fg-subtle line-through"
                          : "bg-accent-soft text-accent";
                        return (
                          <Link
                            key={j}
                            href="/marketing/posts"
                            className={`block truncate rounded px-1.5 py-0.5 text-xs leading-tight ${cls}`}
                            title={`${e.time} · ${e.title}${a ? ` · ${PLATFORM_LABEL[a.platform as Platform] ?? a.platform} ${a.handle}` : ""}`}
                          >
                            {e.time} {e.title}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <p className="text-sm text-fg-muted">
        Blue is due, green went out, red was due and has not been marked as out, struck through means
        it failed or was taken down.
      </p>
    </div>
  );
}
