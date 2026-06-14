"use client";

import { useEffect, useState, useTransition } from "react";
import { Megaphone, CheckCircle2, Pin } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui";
import { TYPE_LABEL, TYPE_TONE, type FeedAnnouncement } from "@/lib/announcements-shared";
import { portalMarkSeenAction, portalAcknowledgeAction } from "@/app/announcements/actions";

const TYPE_BADGE: Record<string, "accent" | "info" | "warn" | "success" | "danger" | "default"> = {
  accent: "accent", info: "info", warn: "warn", success: "success", danger: "danger", muted: "default",
};

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function authorLabel(createdBy: string): string {
  if (createdBy.startsWith("portal-dir:")) return createdBy.slice(11);
  if (createdBy.startsWith("portal-mgr:")) return createdBy.slice(11);
  return "Management";
}

/** Staff-facing announcement list. Marks each item seen on mount, and offers
 *  an acknowledge button on require-ack notices. */
export function AnnouncementFeed({ items }: { items: FeedAnnouncement[] }) {
  const [acked, setAcked] = useState<Record<number, boolean>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    const unseen = items.filter((a) => !a.seenAt);
    if (unseen.length === 0) return;
    // Fire-and-forget — never block the render on read-tracking.
    unseen.forEach((a) => { void portalMarkSeenAction(a.id); });
  }, [items]);

  if (items.length === 0) {
    return <Panel className="p-6 text-center text-sm text-fg-muted">No announcements right now.</Panel>;
  }

  function ack(id: number) {
    start(async () => {
      const res = await portalAcknowledgeAction(id);
      if (res.ok) setAcked((m) => ({ ...m, [id]: true }));
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((a) => {
        const isAcked = a.ackAt != null || acked[a.id];
        return (
          <Panel key={a.id} className={a.type === "urgent" ? "p-4 ring-1 ring-danger/30 bg-danger-soft/20" : "p-4"}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Megaphone size={13} className="text-fg-muted" />
              <Badge tone={TYPE_BADGE[TYPE_TONE[a.type]] ?? "default"}>{TYPE_LABEL[a.type]}</Badge>
              {a.pinned && <Pin size={12} className="text-accent" />}
              <span className="grow" />
              <span className="text-[11px] text-fg-subtle">{authorLabel(a.createdBy)} · {timeLabel(a.publishedAt ?? a.createdAt)}</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold leading-snug">{a.title}</p>
            {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted leading-relaxed">{a.body}</p>}
            {a.requireAck && (
              <div className="mt-2.5">
                {isAcked ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                    <CheckCircle2 size={14} /> You've acknowledged this
                  </span>
                ) : (
                  <Button size="sm" loading={pending} onClick={() => ack(a.id)} className="gap-1.5">
                    <CheckCircle2 size={14} /> I&apos;ve read &amp; understood
                  </Button>
                )}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
