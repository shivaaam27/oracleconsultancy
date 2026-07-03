"use client";

import { CalendarClock, Building2, Tag, MapPin, Users, Repeat, Video, CalendarPlus } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import type { PortalMeetingView } from "@/lib/portal-meetings-data";

/* Read-only meeting details as an Aurora bottom-sheet (centred glass dialog on
 * desktop). Opened by tapping a meeting on the portal home, board, or the
 * /portal/meetings page. Shows the full details + Join / Add-to-Google. */

function fmtRange(m: PortalMeetingView): string {
  const s = new Date(m.startAt);
  if (Number.isNaN(s.getTime())) return "";
  const tz = "Africa/Dar_es_Salaam";
  const day = s.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  if (m.allDay) return `${day} · All day`;
  const t = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const e = m.endAt ? new Date(m.endAt) : null;
  return e && !Number.isNaN(e.getTime()) ? `${day} · ${t(s)} – ${t(e)}` : `${day} · ${t(s)}`;
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 shrink-0 text-fg-subtle">{icon}</span>
      <span className="min-w-0 flex-1 text-fg">{children}</span>
    </div>
  );
}

export function MeetingDetailSheet({ meeting, open, onClose }: { meeting: PortalMeetingView | null; open: boolean; onClose: () => void }) {
  const m = meeting;
  const join = m ? (m.meetLink || (m.location && /^https?:\/\//i.test(m.location) ? m.location : null)) : null;
  return (
    <BottomSheet
      open={open && !!m}
      onClose={onClose}
      icon={<CalendarClock size={18} className="text-accent" />}
      title={m?.title ?? "Meeting"}
      footer={
        m ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {join && (
              <a
                href={join}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
              >
                <Video size={15} /> Join meeting
              </a>
            )}
            <a
              href={m.googleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-bg-subtle px-4 py-2.5 text-sm font-medium ring-1 ring-border transition-colors hover:ring-accent/40"
            >
              <CalendarPlus size={15} /> Add to Google Calendar
            </a>
          </div>
        ) : null
      }
    >
      {m && (
        <div className="flex flex-col gap-3">
          <Row icon={<CalendarClock size={15} />}>{fmtRange(m)}</Row>
          {m.companyName && <Row icon={<Building2 size={15} />}>{m.companyName}</Row>}
          {m.categoryName && (
            <Row icon={<Tag size={15} />}>
              <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-xs ring-1 ring-border">{m.categoryName}</span>
            </Row>
          )}
          {m.recurrenceLabel && <Row icon={<Repeat size={15} />}>{m.recurrenceLabel}</Row>}
          {m.location && !/^https?:\/\//i.test(m.location) && <Row icon={<MapPin size={15} />}>{m.location}</Row>}
          {m.attendees.length > 0 && (
            <Row icon={<Users size={15} />}>
              <span className="text-fg-muted">{m.attendees.join(", ")}</span>
            </Row>
          )}
          {m.description && (
            <div className="mt-1 whitespace-pre-wrap rounded-xl bg-bg-subtle/60 p-3 text-sm text-fg-muted ring-1 ring-border/60">
              {m.description}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
