import { Video, ExternalLink } from "lucide-react";
import { Panel } from "@/components/surface-kit";

export type PortalMeeting = {
  id: number;
  title: string;
  startAt: string;
  allDay: boolean;
  meetLink: string | null;
  location: string | null;
};

function fmtWhen(e: PortalMeeting): string {
  const d = new Date(e.startAt);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" });
  if (e.allDay) return `${day} · All day`;
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" });
  return `${day} · ${time}`;
}

/** Read-only "Your meetings" list for the staff/manager portal home. Shows the
 *  time + a Join button for any meeting with a Meet (or video) link. Staff can
 *  only receive details here — they never create events. */
export function PortalMeetings({ meetings }: { meetings: PortalMeeting[] }) {
  if (meetings.length === 0) return null;
  return (
    <Panel className="divide-y divide-border/60 overflow-hidden p-0">
      {meetings.map((e) => {
        const d = new Date(e.startAt);
        const valid = !Number.isNaN(d.getTime());
        const join = e.meetLink || (e.location && /^https?:\/\//i.test(e.location) ? e.location : null);
        return (
          <div key={e.id} className="flex items-center gap-3 p-3">
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-soft/60 text-accent">
              <span className="text-[9px] font-medium uppercase leading-none">{valid ? d.toLocaleDateString("en-GB", { month: "short", timeZone: "Africa/Dar_es_Salaam" }) : "—"}</span>
              <span className="text-base font-semibold leading-none tabular">{valid ? d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Africa/Dar_es_Salaam" }) : ""}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.title}</p>
              <p className="truncate text-[11px] text-fg-subtle">{fmtWhen(e)}</p>
            </div>
            {join && (
              <a
                href={join}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
              >
                <Video size={13} /> Join
              </a>
            )}
            {!join && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-fg-subtle">
                <ExternalLink size={12} /> In person
              </span>
            )}
          </div>
        );
      })}
    </Panel>
  );
}
