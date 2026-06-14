/* Pure, client-safe announcement types + constants + predicates.
 * No DB, no server-only — so client components (composer, feed) can import
 * these. The server module (announcements.ts) re-exports everything here. */

export type AnnouncementType =
  | "policy" | "holiday" | "safety" | "celebration" | "operational" | "urgent";

export type AudienceKind =
  | "all" | "company" | "department" | "site" | "role"
  | "person_type" | "people" | "managers" | "directors";

export type Tone = "muted" | "info" | "warn" | "success" | "accent" | "danger";

export const ANNOUNCEMENT_TYPES: { value: AnnouncementType; label: string; tone: Tone }[] = [
  { value: "operational", label: "Operational", tone: "accent" },
  { value: "policy", label: "Policy", tone: "info" },
  { value: "holiday", label: "Holiday", tone: "success" },
  { value: "safety", label: "Safety", tone: "warn" },
  { value: "celebration", label: "Celebration", tone: "success" },
  { value: "urgent", label: "Urgent", tone: "danger" },
];

export const TYPE_TONE: Record<AnnouncementType, Tone> = {
  operational: "accent",
  policy: "info",
  holiday: "success",
  safety: "warn",
  celebration: "success",
  urgent: "danger",
};

export const TYPE_LABEL: Record<AnnouncementType, string> = {
  operational: "Operational",
  policy: "Policy",
  holiday: "Holiday",
  safety: "Safety",
  celebration: "Celebration",
  urgent: "Urgent",
};

export const AUDIENCE_KINDS: { value: AudienceKind; label: string; needsValues: boolean }[] = [
  { value: "all", label: "Everyone", needsValues: false },
  { value: "company", label: "A company", needsValues: true },
  { value: "department", label: "A department", needsValues: true },
  { value: "site", label: "A location/site", needsValues: true },
  { value: "role", label: "A job role", needsValues: true },
  { value: "person_type", label: "A staff type", needsValues: true },
  { value: "people", label: "Specific people", needsValues: true },
  { value: "managers", label: "All managers", needsValues: false },
  { value: "directors", label: "All directors", needsValues: false },
];

export type Announcement = {
  id: number;
  title: string;
  body: string;
  type: AnnouncementType;
  audienceKind: AudienceKind;
  audienceValues: (number | string)[];
  pinned: boolean;
  requireAck: boolean;
  status: "draft" | "published" | "archived";
  publishAt: string | null;
  expiresAt: string | null;
  createdBy: string;
  authorPersonId: number | null;
  createdAt: string;
  publishedAt: string | null;
};

export type FeedAnnouncement = Announcement & { seenAt: string | null; ackAt: string | null };

export type PersonAudienceAttrs = {
  id: number;
  companyId: number | null;
  departmentId: number | null;
  role: string | null;
  personType: string | null;
  portalRole: "staff" | "manager" | "director";
  siteIds: number[];
};

export type ReceiptStats = { seen: number; ack: number; total: number };

/** A live announcement is published, past its (optional) go-live, and not expired. */
export function isLive(a: Announcement, now = new Date()): boolean {
  if (a.status !== "published") return false;
  if (a.publishAt && new Date(a.publishAt) > now) return false;
  if (a.expiresAt && new Date(a.expiresAt) <= now) return false;
  return true;
}

/** A scheduled-but-not-yet-live published announcement. */
export function isScheduled(a: Announcement, now = new Date()): boolean {
  return a.status === "published" && !!a.publishAt && new Date(a.publishAt) > now;
}

/** Does this announcement's audience include this person? Pure, no I/O. */
export function announcementTargetsPerson(a: Announcement, p: PersonAudienceAttrs): boolean {
  const nums = a.audienceValues.filter((v): v is number => typeof v === "number");
  const strs = a.audienceValues.filter((v): v is string => typeof v === "string");
  switch (a.audienceKind) {
    case "all": return true;
    case "company": return p.companyId != null && nums.includes(p.companyId);
    case "department": return p.departmentId != null && nums.includes(p.departmentId);
    case "site": return p.siteIds.some((s) => nums.includes(s));
    case "role": return p.role != null && strs.includes(p.role);
    case "person_type": return p.personType != null && strs.includes(p.personType);
    case "people": return nums.includes(p.id);
    case "managers": return p.portalRole === "manager" || p.portalRole === "director";
    case "directors": return p.portalRole === "director";
    default: return false;
  }
}

/** Human label for an audience, given name lookups. */
export function audienceLabel(
  a: Announcement,
  maps: {
    companies?: Map<number, string>;
    departments?: Map<number, string>;
    sites?: Map<number, string>;
    people?: Map<number, string>;
  }
): string {
  const nums = a.audienceValues.filter((v): v is number => typeof v === "number");
  const strs = a.audienceValues.filter((v): v is string => typeof v === "string");
  const names = (ids: number[], m?: Map<number, string>) => ids.map((id) => m?.get(id) ?? `#${id}`).join(", ");
  switch (a.audienceKind) {
    case "all": return "Everyone";
    case "company": return names(nums, maps.companies) || "A company";
    case "department": return names(nums, maps.departments) || "Department";
    case "site": return names(nums, maps.sites) || "A location";
    case "role": return strs.join(", ") || "A role";
    case "person_type": return strs.map((s) => s.replace(/_/g, " ")).join(", ") || "A staff type";
    case "people": return nums.length === 1 ? (maps.people?.get(nums[0]) ?? "1 person") : `${nums.length} people`;
    case "managers": return "All managers";
    case "directors": return "All directors";
    default: return "—";
  }
}
