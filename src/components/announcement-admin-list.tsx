"use client";

import { useTransition } from "react";
import { Pin, Send, Archive, Trash2, Users, CheckCircle2, Clock, Eye } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { Badge, Button } from "@/components/ui";
import { TYPE_LABEL, TYPE_TONE } from "@/lib/announcements-shared";
import {
  publishAnnouncementAction,
  archiveAnnouncementAction,
  deleteAnnouncementAction,
} from "@/app/announcements/actions";

const TYPE_BADGE: Record<string, "accent" | "info" | "warn" | "success" | "danger" | "default"> = {
  accent: "accent", info: "info", warn: "warn", success: "success", danger: "danger", muted: "default",
};

export type AdminAnnouncement = {
  id: number;
  title: string;
  body: string;
  type: keyof typeof TYPE_LABEL;
  status: "draft" | "published" | "archived";
  pinned: boolean;
  requireAck: boolean;
  audienceText: string;
  whenLabel: string;
  scheduledLabel: string | null;
  expiresLabel: string | null;
  stats: { seen: number; ack: number; total: number };
};

export function AnnouncementAdminList({ items }: { items: AdminAnnouncement[] }) {
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return <Panel className="p-6 text-center text-sm text-fg-muted">No announcements yet. Create your first one above.</Panel>;
  }

  function run(fn: () => Promise<unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    start(async () => { await fn(); });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((a) => (
        <Panel key={a.id} className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={TYPE_BADGE[TYPE_TONE[a.type]] ?? "default"}>{TYPE_LABEL[a.type]}</Badge>
            {a.pinned && <Pin size={12} className="text-accent" />}
            {a.status === "draft" && <Badge tone="default">Draft</Badge>}
            {a.status === "published" && a.scheduledLabel && <Badge tone="warn">Scheduled</Badge>}
            {a.requireAck && <Badge tone="info">Ack required</Badge>}
            <span className="grow" />
            <span className="text-[11px] text-fg-subtle">{a.scheduledLabel ?? a.whenLabel}</span>
          </div>

          <p className="mt-1.5 text-sm font-semibold leading-snug">{a.title}</p>
          {a.body && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-fg-muted">{a.body}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
            <span className="inline-flex items-center gap-1"><Users size={12} /> {a.audienceText}</span>
            {a.status === "published" && !a.scheduledLabel && (
              <>
                <span className="inline-flex items-center gap-1"><Eye size={12} /> {a.stats.seen}/{a.stats.total} seen</span>
                {a.requireAck && (
                  <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> {a.stats.ack}/{a.stats.total} acknowledged</span>
                )}
              </>
            )}
            {a.expiresLabel && <span className="inline-flex items-center gap-1"><Clock size={12} /> expires {a.expiresLabel}</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {a.status === "draft" && (
              <Button size="sm" loading={pending} onClick={() => run(() => publishAnnouncementAction(a.id))} className="gap-1.5">
                <Send size={13} /> Publish
              </Button>
            )}
            {a.status !== "archived" && (
              <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => archiveAnnouncementAction(a.id), "Archive this announcement? It will stop showing to staff.")} className="gap-1.5">
                <Archive size={13} /> Archive
              </Button>
            )}
            <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => deleteAnnouncementAction(a.id), "Delete permanently? This cannot be undone.")} className="gap-1.5 text-danger">
              <Trash2 size={13} /> Delete
            </Button>
          </div>
        </Panel>
      ))}
    </div>
  );
}
