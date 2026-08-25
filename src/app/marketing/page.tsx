import Link from "next/link";
import { Megaphone, CalendarRange, AtSign, Handshake, Camera, AlertTriangle, Clock, CheckCircle2, ImageIcon, BarChart3, Gauge, Send, Globe } from "lucide-react";
import { PageHeader, ButtonLink } from "@/components/ui";
import { listAccounts, listCampaigns, listClients, listPostsWithState, clientFreePeriods } from "@/lib/marketing";
import { listAssets, listShoots, assetUseCounts } from "@/lib/marketing-assets";
import { listSpend, resultsByPublication, toSpend } from "@/lib/marketing-results";
import { summariseSpend } from "@/lib/marketing-results-shared";
import { PLATFORM_LABEL, type Platform } from "@/lib/marketing-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing — Oracle Consultancy" };

/**
 * The marketing desk.
 *
 * Phase 1: the record and the calendar. Nothing here talks to Instagram,
 * Facebook, LinkedIn or TikTok — every figure is typed by a person, because
 * each platform needs an application that takes weeks and can be refused, and
 * a module that waits on one cannot be used. See memory/marketing_module_plan.md.
 *
 * ⚠️ EVERY NUMBER IS A DOOR, and every one is worked out on read. There is no
 * stored post status, no stored free-period end date, nothing to go stale.
 */
export default async function MarketingPage() {
  const [posts, accounts, clients, campaigns, free, assets, shoots, uses] = await Promise.all([
    listPostsWithState(), listAccounts(), listClients(), listCampaigns(), clientFreePeriods(),
    listAssets(), listShoots(), assetUseCounts(),
  ]);

  /* ⚠️ Only what actually went out can have figures. Counting planned posts
     here would make "not measured yet" meaningless. */
  const outIds = posts.flatMap((p) => p.publications.filter((x) => x.status === "published").map((x) => x.id));
  const [readings, spendRows] = await Promise.all([resultsByPublication(outIds), listSpend()]);
  const unmeasured = outIds.filter((id) => (readings.get(id) ?? []).length === 0).length;
  const ourSpend = summariseSpend(spendRows.map(toSpend)).ours;
  const tzs = (n: number) => `TZS ${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  /* ⚠️ The excess pile — everything shot and never published. It is the number
     this module exists to make visible: today it lives on a phone until the
     phone is replaced. */
  const unused = assets.filter((a) => (uses.get(a.id) ?? 0) === 0).length;
  const noConsent = shoots.filter((s) => s.consent === null).length;

  /* ⚠️ The number that matters most on this page: something that was due to go
     out and has not. It is the only way a one-person operation notices a gap. */
  const overdue = posts.filter((p) => p.state === "overdue").length;
  const scheduled = posts.filter((p) => p.state === "scheduled").length;
  const published = posts.filter((p) => p.state === "published" || p.state === "partly out").length;

  /* ⚠️ "Partly out" is counted separately and never rounded into published —
     one design to three accounts where the third failed is exactly the thing
     worth surfacing. */
  const partly = posts.filter((p) => p.state === "partly out").length;
  const ideas = posts.filter((p) => p.state === "idea").length;

  /* ⚠️ A free period nearly up is money about to be spent that nobody promised.
     Counted here so it cannot quietly roll into a fourth month. */
  const ending = [...free.values()].filter((f) => f.state === "ending soon").length;
  const ended = [...free.values()].filter((f) => f.state === "ended").length;
  const running = [...free.values()].filter((f) => f.state === "running").length;

  /* ⚠️ An account nobody has confirmed as a professional one can never have its
     numbers read, whatever we build later. Said now, while it costs a minute to
     fix, rather than discovered at Phase 4. */
  const unknownKind = accounts.filter((a) => a.professional === null).length;
  const personal = accounts.filter((a) => a.professional === false).length;

  const byPlatform = new Map<string, number>();
  for (const a of accounts) byPlatform.set(a.platform, (byPlatform.get(a.platform) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Marketing"
        sub="Social media and photography — what went out, for whom, and what it did"
        action={
          <ButtonLink href="/marketing/posts" size="sm">
            <Send size={14} /> Log a post
          </ButtonLink>
        }
      />

      {/* What needs you, first. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          href="/marketing/posts?state=overdue"
          icon={<AlertTriangle size={16} />}
          n={overdue}
          label={overdue === 1 ? "post was due and has not gone" : "posts were due and have not gone"}
          tone={overdue > 0 ? "danger" : undefined}
        />
        <Tile
          href="/marketing/calendar"
          icon={<Clock size={16} />}
          n={scheduled}
          label="scheduled to go out"
          tone={undefined}
        />
        <Tile
          href="/marketing/posts?state=published"
          icon={<CheckCircle2 size={16} />}
          n={published}
          label={partly > 0 ? `have gone out · ${partly} only partly` : "have gone out"}
          tone={partly > 0 ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1 Plan */}
        <Tile href="/marketing/campaigns" icon={<Megaphone size={16} />} n={campaigns.length}
          label={`campaign${campaigns.length === 1 ? "" : "s"}`} />
        <Tile href="/marketing/calendar" icon={<CalendarRange size={16} />} value="Calendar"
          label="the month, and what is planned" />

        {/* 2 Shoot */}
        <Tile href="/marketing/shoots" icon={<Camera size={16} />} n={shoots.length}
          label={noConsent > 0 ? `shoots · ${noConsent} without consent recorded` : `shoot${shoots.length === 1 ? "" : "s"}`}
          tone={noConsent > 0 ? "warn" : undefined} />
        <Tile href="/marketing/library" icon={<ImageIcon size={16} />} n={assets.length}
          label={unused > 0 ? `pictures · ${unused} never used` : `picture${assets.length === 1 ? "" : "s"} in the library`} />

        {/* 3 Post */}
        <Tile href="/marketing/posts" icon={<Send size={16} />} n={posts.length}
          label={ideas > 0 ? `posts · ${ideas} still just an idea` : `post${posts.length === 1 ? "" : "s"} recorded`} />

        {/* 4 Measure */}
        <Tile href="/marketing/results" icon={<BarChart3 size={16} />}
          value={ourSpend > 0 ? tzs(ourSpend) : "Nothing yet"}
          label="spent on advertising, our cost" />
        <Tile href="/marketing/results" icon={<Gauge size={16} />} n={unmeasured}
          label={unmeasured > 0 ? "out but never measured" : "everything out has figures"} />

        {/* 5 Set up */}
        <Tile href="/marketing/accounts" icon={<AtSign size={16} />} n={accounts.length}
          label={
            accounts.length === 0 ? "no accounts added yet"
            : unknownKind > 0 ? `accounts · ${unknownKind} not confirmed professional`
            : personal > 0 ? `accounts · ${personal} personal, cannot be read`
            : "accounts, all professional"
          }
          tone={unknownKind > 0 ? "warn" : personal > 0 ? "danger" : undefined} />
        <Tile href="/marketing/clients" icon={<Handshake size={16} />} n={clients.length}
          label={
            ended > 0 ? `clients · ${ended} past their free months`
            : ending > 0 ? `clients · ${ending} nearly out of free months`
            : running > 0 ? `clients · ${running} inside their free months`
            : `advertising client${clients.length === 1 ? "" : "s"}`
          }
          tone={ended > 0 ? "danger" : ending > 0 ? "warn" : undefined} />
        {/* ⚠️ A count and the names underneath — one tile listing every platform
            truncated to "1 Facebook · 2 Instagra…" as soon as a third appeared. */}
        <Tile href="/marketing/accounts" icon={<Globe size={16} />}
          n={byPlatform.size}
          label={byPlatform.size === 0
            ? "platforms in use"
            : `platform${byPlatform.size === 1 ? "" : "s"} · ${[...byPlatform.keys()].map((p) => PLATFORM_LABEL[p as Platform] ?? p).join(", ")}`} />
      </div>

      {/* ⚠️ Said plainly rather than implied by an empty screen. Somebody
          opening this in six months should not have to work out why there are
          no automatic figures. */}
      <p className="rounded-lg border border-border bg-bg-subtle px-3.5 py-2.5 text-sm text-fg-muted">
        Everything here is typed by hand, on purpose. Instagram, TikTok and LinkedIn each need an
        application that takes weeks and can be refused, so nothing in this module waits on one.
        Reading the numbers automatically comes later and changes only where a figure came from.
      </p>
    </div>
  );
}

function Tile({ href, icon, n, value, label, tone }: {
  href: string;
  icon: React.ReactNode;
  n?: number;
  value?: string;
  label: string;
  tone?: "warn" | "danger";
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-bg-elev px-3.5 py-3 transition-colors hover:border-accent/40 hover:bg-bg-subtle"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-lg font-semibold leading-none tabular ${
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg"}`}>
          {value ?? n}
        </span>
        <span className="mt-1 block text-sm text-fg-muted">{label}</span>
      </span>
    </Link>
  );
}
