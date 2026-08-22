"use client";

import { useMemo, useState } from "react";
import { Search, Video, CalendarClock } from "lucide-react";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { MeetingDetailSheet } from "@/components/meeting-detail-sheet";
import { DirectorEventForm } from "@/components/director-event-form";
import { portalCreateEvent } from "@/app/portal/actions";
import type { PortalMeetingView } from "@/lib/portal-meetings-data";
import type { PickerPerson, PickerCompany } from "@/lib/portal-picker";

const tz = "Africa/Dar_es_Salaam";

/** Day bucket label: Today / Tomorrow / weekday+date. */
function dayHeading(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Scheduled";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOf(new Date());
  const day = startOf(d);
  const diff = Math.round((day - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
}

function fmtTime(m: PortalMeetingView): string {
  const d = new Date(m.startAt);
  if (Number.isNaN(d.getTime())) return "";
  if (m.allDay) return "All day";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

export function PortalMeetingsPage({
  meetings, companies, categories, canCreate, pickerPeople, pickerCompanies,
}: {
  meetings: PortalMeetingView[];
  companies: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  canCreate: boolean;
  pickerPeople: PickerPerson[];
  pickerCompanies: PickerCompany[];
}) {
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<PortalMeetingView | null>(null);

  const companyOpts: FluidOption[] = [{ value: "all", label: "All companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))];
  const categoryOpts: FluidOption[] = [{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: String(c.id), label: c.name })), { value: "none", label: "Uncategorised" }];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meetings.filter((m) => {
      if (company !== "all" && String(m.companyId ?? "") !== company) return false;
      if (category === "none" ? m.categoryId != null : category !== "all" && String(m.categoryId ?? "") !== category) return false;
      if (needle) {
        const hay = `${m.title} ${m.companyName ?? ""} ${m.categoryName ?? ""} ${m.location ?? ""} ${m.attendees.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [meetings, q, company, category]);

  // Group into day buckets, preserving the soonest-first order.
  const groups = useMemo(() => {
    const out: { heading: string; items: PortalMeetingView[] }[] = [];
    for (const m of filtered) {
      const heading = dayHeading(m.startAt);
      const last = out[out.length - 1];
      if (last && last.heading === heading) last.items.push(m);
      else out.push({ heading, items: [m] });
    }
    return out;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel
        icon={<CalendarClock size={13} />}
        action={
          canCreate ? (
            <DirectorEventForm
              people={pickerPeople}
              companies={pickerCompanies}
              action={portalCreateEvent}
              triggerLabel="New meeting"
            />
          ) : undefined
        }
      >
        Upcoming meetings
      </SectionLabel>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search meetings, people…"
            className="w-full rounded-xl bg-bg-subtle py-2.5 pl-9 pr-3 text-sm ring-1 ring-border placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        {companies.length > 1 && <div className="sm:w-48"><FluidSelect value={company} options={companyOpts} onSelect={setCompany} /></div>}
        {categories.length > 0 && <div className="sm:w-48"><FluidSelect value={category} options={categoryOpts} onSelect={setCategory} /></div>}
      </div>

      {groups.length === 0 ? (
        <Panel className="p-6 text-center text-sm text-fg-muted">
          {meetings.length === 0 ? "No upcoming meetings." : "No meetings match your filters."}
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.heading} className="flex flex-col gap-1.5">
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{g.heading}</p>
              <Panel className="divide-y divide-border/60 overflow-hidden p-0">
                {g.items.map((m) => {
                  const join = m.meetLink || (m.location && /^https?:\/\//i.test(m.location) ? m.location : null);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelected(m)}
                      className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-bg-subtle/40"
                    >
                      <span className="w-14 shrink-0 text-sm font-semibold tabular text-accent">{fmtTime(m)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <p className="truncate text-xs text-fg-subtle">
                          {[m.companyName, m.categoryName].filter(Boolean).join(" · ") || "Meeting"}
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
            </div>
          ))}
        </div>
      )}

      <MeetingDetailSheet meeting={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
