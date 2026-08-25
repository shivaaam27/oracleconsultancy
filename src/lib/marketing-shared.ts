/**
 * Marketing — the pure half.
 *
 * ⚠️ CLIENT-SAFE. No `sb`, no database, no server-only import. This is what
 * client components import; `marketing.ts` is server-only and is the ONE DOOR
 * for writes. Getting this wrong kills every page with
 * "SUPABASE_SERVICE_ROLE_KEY is not set".
 *
 * Everything here is worked out on read. There is no stored status, no stored
 * end date, no stored count — same rule as the rest of COS.
 */

/* ── platforms ───────────────────────────────────────────────────────────── */

export const PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok", "youtube", "x", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  other: "Other",
};

/**
 * Whether a platform can ever hand us its numbers, and what it needs first.
 *
 * ⚠️ THIS IS NOT A FEATURE FLAG — nothing reads it to decide behaviour. It is
 * here so the accounts screen can TELL somebody what is required, because the
 * requirement is paperwork they must do themselves and cannot be coded around.
 */
export const PLATFORM_NEEDS: Record<Platform, string> = {
  instagram: "A Business or Creator account, linked to a Facebook Page.",
  facebook:  "A Facebook Page — a personal profile cannot be read.",
  linkedin:  "A company page, and approved partner status, which is often refused.",
  tiktok:    "A Business account, and an app audit before anything posts publicly.",
  youtube:   "A channel you own.",
  x:         "A paid API tier.",
  other:     "Nothing automatic — this one stays typed by hand.",
};

export const POST_KINDS = ["photo", "video", "carousel", "story", "reel", "text"] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const PUBLICATION_STATUSES = ["planned", "published", "failed", "removed"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/* ── shapes ──────────────────────────────────────────────────────────────── */

export type MktAccount = {
  id: number;
  platform: string;
  handle: string;
  displayName: string | null;
  companyId: number | null;
  clientId: number | null;
  profileUrl: string | null;
  /** ⚠️ null = nobody has said. Never treated as false. */
  professional: boolean | null;
  archived: boolean;
};

export type MktPublication = {
  id: number;
  postId: number;
  accountId: number;
  status: string;
  plannedFor: string | null;
  publishedAt: string | null;
  url: string | null;
  reason: string | null;
};

export type MktClient = {
  id: number;
  name: string;
  freeMonths: number;
  /** Only set when somebody stated a start; otherwise the first post decides. */
  freeStartsOn: string | null;
  adCapMonthly: string | number | null;
  archived: boolean;
};

/* ── how a post is getting on ────────────────────────────────────────────── */

export type PostState =
  | "idea"        // written down, going nowhere yet
  | "scheduled"   // due to go out
  | "overdue"     // was due and has not gone
  | "partly out"  // some accounts have it, some do not
  | "published"
  | "failed"
  | "removed";

/**
 * A post's state, worked out from its publications — never stored.
 *
 * ⚠️ "PARTLY OUT" IS A REAL STATE AND MUST NOT BE ROUNDED AWAY. One design goes
 * to three accounts and the third fails; calling that "published" hides the
 * only thing anybody needed to know.
 */
export function postState(pubs: MktPublication[], now = new Date()): PostState {
  if (pubs.length === 0) return "idea";

  const live = pubs.filter((p) => p.status !== "removed");
  if (live.length === 0) return "removed";

  const published = live.filter((p) => p.status === "published");
  if (published.length === live.length) return "published";

  const failed = live.filter((p) => p.status === "failed");
  if (failed.length === live.length) return "failed";
  if (published.length > 0) return "partly out";
  if (failed.length > 0) return "partly out";

  // Everything still planned. Is any of it late?
  const late = live.some((p) => p.plannedFor != null && new Date(p.plannedFor).getTime() < now.getTime());
  return late ? "overdue" : "scheduled";
}

export const POST_STATE_LABEL: Record<PostState, string> = {
  idea: "Idea",
  scheduled: "Scheduled",
  overdue: "Overdue",
  "partly out": "Partly out",
  published: "Published",
  failed: "Failed",
  removed: "Taken down",
};

export const POST_STATE_TONE: Record<PostState, "default" | "success" | "warn" | "danger" | "info"> = {
  idea: "default",
  scheduled: "info",
  overdue: "danger",
  "partly out": "warn",
  published: "success",
  failed: "danger",
  removed: "default",
};

/* ── the free three months ───────────────────────────────────────────────── */

/**
 * Add whole months to an ISO date, clamping to the end of the month.
 *
 * ⚠️ 30 NOVEMBER PLUS THREE MONTHS IS 28 FEBRUARY, NOT 2 MARCH. Letting the
 * date roll over is the classic way a free period quietly runs two days long
 * on some clients and not others.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  return `${target.getUTCFullYear()}-${mm}-${String(day).padStart(2, "0")}`;
}

export type FreePeriod = {
  /** null while nothing has been posted for them yet. */
  startsOn: string | null;
  endsOn: string | null;
  daysLeft: number | null;
  state: "not started" | "running" | "ending soon" | "ended";
  /** Where the start came from, because the two are not equally trustworthy. */
  source: "stated" | "first post" | "none";
};

/** Inside this many days of the end, the countdown should shout. */
export const FREE_ENDING_SOON_DAYS = 14;

/**
 * When a client's free advertising started, ends, and how it stands.
 *
 * ⚠️ THE CLOCK STARTS ON THE FIRST POST, NOT ON THE HANDSHAKE. The owner had
 * not set a start date because posting had not begun — so the module must not
 * ask for one. `firstPublishedOn` is the earliest moment anything actually went
 * out for them; a stated `freeStartsOn` beats it, because somebody saying so is
 * better evidence than an inference.
 */
export function freePeriod(
  client: Pick<MktClient, "freeMonths" | "freeStartsOn">,
  firstPublishedOn: string | null,
  today = new Date(),
): FreePeriod {
  const stated = client.freeStartsOn?.slice(0, 10) ?? null;
  const start = stated ?? firstPublishedOn?.slice(0, 10) ?? null;
  const source: FreePeriod["source"] = stated ? "stated" : firstPublishedOn ? "first post" : "none";

  if (!start) return { startsOn: null, endsOn: null, daysLeft: null, state: "not started", source };

  const endsOn = addMonths(start, client.freeMonths);
  const todayIso = today.toISOString().slice(0, 10);
  const daysLeft = Math.round(
    (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000,
  );

  const state: FreePeriod["state"] =
    daysLeft < 0 ? "ended" : daysLeft <= FREE_ENDING_SOON_DAYS ? "ending soon" : "running";

  return { startsOn: start, endsOn, daysLeft, state, source };
}

/* ── small helpers ───────────────────────────────────────────────────────── */

/** "@cocozuri" however somebody typed it — one leading @, no spaces. */
export function tidyHandle(raw: string): string {
  return "@" + raw.trim().replace(/^@+/, "").replace(/\s+/g, "");
}

/**
 * Whether an account could ever have its numbers read.
 * ⚠️ Three-state in, three-state out. "Nobody has said" is not "no".
 */
export function canBeRead(a: Pick<MktAccount, "professional">): boolean | null {
  return a.professional;
}

/** Who an account belongs to, for grouping. Exactly one is set. */
export function ownerKey(a: Pick<MktAccount, "companyId" | "clientId">): string {
  return a.companyId != null ? `company:${a.companyId}` : `client:${a.clientId}`;
}
