"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { FeedAnnouncement } from "@/lib/announcements-shared";
import { portalAcknowledgeAction } from "@/app/announcements/actions";

/** Full-screen, must-acknowledge card shown on portal landing for urgent
 *  "takeover" announcements. Steps through each one; can't be dismissed until
 *  every one is acknowledged. */
export function AnnouncementTakeover({ items }: { items: FeedAnnouncement[] }) {
  const [queue, setQueue] = useState(items);
  const [pending, start] = useTransition();
  if (queue.length === 0) return null;

  const current = queue[0];

  function acknowledge() {
    start(async () => {
      const res = await portalAcknowledgeAction(current.id);
      if (res.ok) setQueue((q) => q.slice(1));
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-bg-elev ring-1 ring-danger/30 elevated p-6 shadow-pill">
        <div className="flex items-center gap-2 text-danger">
          <AlertTriangle size={18} />
          <span className="text-xs font-semibold uppercase tracking-[0.1em]">Urgent — please read</span>
          {items.length > 1 && (
            <span className="ml-auto text-xs text-fg-subtle">{items.length - queue.length + 1} of {items.length}</span>
          )}
        </div>
        <h2 className="mt-3 text-lg font-semibold leading-snug">{current.title}</h2>
        {current.body && (
          <p className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm text-fg-muted leading-relaxed">{current.body}</p>
        )}
        <div className="mt-5">
          <Button loading={pending} onClick={acknowledge} className="w-full gap-1.5">
            <CheckCircle2 size={15} /> I&apos;ve read &amp; understood
          </Button>
        </div>
      </div>
    </div>
  );
}
