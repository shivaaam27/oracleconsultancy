"use client";

import { useState } from "react";
import { Video } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { MeetingDetailSheet } from "@/components/meeting-detail-sheet";
import type { PortalMeetingView } from "@/lib/portal-meetings-data";

/** Kept for callers that still import the old name. */
export type PortalMeeting = PortalMeetingView;

function fmtWhen(e: PortalMeetingView): string {
  const d = new Date(e.startAt);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" });
  if (e.allDay) return `${day} · All day`;
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" });
  return `${day} · ${time}`;
}

/** "Your meetings" list for the portal home. Each row opens a detail sheet;
 *  meetings with a Meet/video link keep a one-tap Join. */
export function PortalMeetings({ meetings }: { meetings: PortalMeetingView[] }) {
  const [selected, setSelected] = useState<PortalMeetingView | null>(null);
  if (meetings.length === 0) return null;
  return (
    <>
      <Panel className="divide-y divide-border/60 overflow-hidden p-0">
        {meetings.map((e) => {
          const d = new Date(e.startAt);
          const valid = !Number.isNaN(d.getTime());
          const join = e.meetLink || (e.location && /^https?:\/\//i.test(e.location) ? e.location : null);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-bg-subtle/40"
            >
              <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-soft/60 text-accent">
                <span className="text-[9px] font-medium uppercase leading-none">{valid ? d.toLocaleDateString("en-GB", { month: "short", timeZone: "Africa/Dar_es_Salaam" }) : "—"}</span>
                <span className="text-base font-semibold leading-none tabular">{valid ? d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Africa/Dar_es_Salaam" }) : ""}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.title}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {fmtWhen(e)}{e.companyName ? ` · ${e.companyName}` : ""}
                </p>
              </div>
              {join && (
                <a
                  href={join}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(ev) => ev.stopPropagation()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
                >
                  <Video size={13} /> Join
                </a>
              )}
            </button>
          );
        })}
      </Panel>
      <MeetingDetailSheet meeting={selected} open={!!selected} onClose={() => setSelected(null)} />
    </>
  );
}
