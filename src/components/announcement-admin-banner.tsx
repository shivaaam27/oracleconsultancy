import Link from "next/link";
import { Megaphone, ChevronRight, Pin } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { listAnnouncements } from "@/lib/announcements";
import { isLive, TYPE_LABEL, TYPE_TONE } from "@/lib/announcements-shared";

const TYPE_BADGE: Record<string, "accent" | "info" | "warn" | "success" | "danger" | "default"> = {
  accent: "accent", info: "info", warn: "warn", success: "success", danger: "danger", muted: "default",
};

/** A compact strip of what's currently posted, shown at the top of the admin
 *  home so the owner always sees what staff are seeing. Renders nothing when
 *  there's nothing live. */
export async function AnnouncementAdminBanner() {
  let live: Awaited<ReturnType<typeof listAnnouncements>> = [];
  try {
    const all = await listAnnouncements(false);
    const now = new Date();
    live = all.filter((a) => isLive(a, now)).slice(0, 3);
  } catch {
    return null;
  }
  if (live.length === 0) return null;

  return (
    <Panel className="p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <Megaphone size={14} className="text-accent" />
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Live announcements</span>
        <Link href="/announcements" className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-accent hover:underline">
          Manage <ChevronRight size={12} />
        </Link>
      </div>
      <ul className="flex flex-col gap-1.5">
        {live.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <Badge tone={TYPE_BADGE[TYPE_TONE[a.type]] ?? "default"}>{TYPE_LABEL[a.type]}</Badge>
            {a.pinned && <Pin size={11} className="text-accent shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
