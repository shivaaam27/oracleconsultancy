"use client";

import { DatePopover } from "@/components/date-popover";
import { FluidSelect } from "@/components/fluid-select";

/* Shared date + time controls for event/meeting forms. The date uses the Aurora
 * DatePopover; the time uses a FluidSelect of 15-min slots (same as the
 * command-centre calendar) so both look like every other dropdown and match the
 * full-size field boxes around them. Value is a datetime-local string
 * ("yyyy-mm-ddThh:mm"), or just "yyyy-mm-dd" for all-day; onChange emits the same. */

// The full-size Aurora field box so the date + time triggers match the other
// controls on the form (Company, Responsible people, etc.).
export const FIELD_TRIGGER = "rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-3 text-sm text-fg transition-colors hover:ring-accent/40";

/**
 * A stored UTC instant → the value THESE controls expect ("yyyy-mm-ddThh:mm",
 * or "yyyy-mm-dd" for all-day), read as Dar es Salaam wall-clock.
 *
 * The inverse of what the server's `localToIso` does on submit. It lives here,
 * beside `composeDT`/`dateOf`/`timeOf`, because both event forms now need it —
 * the command centre to show an event being edited, and the portal sheet to
 * drop in a time read off an attached ticket.
 */
export function isoToLocalInput(iso: string | null, allDay: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Shift to +03:00, then read the UTC fields — the same trick used app-wide.
  const shifted = new Date(d.getTime() + 3 * 3600_000).toISOString();
  return allDay ? shifted.slice(0, 10) : shifted.slice(0, 16);
}

// Time-of-day options every 15 min, e.g. { value: "14:30", label: "2:30 PM" }.
export const TIME_OPTS: { value: string; label: string }[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? "AM" : "PM";
  return { value: `${hh}:${mm}`, label: `${h12}:${mm} ${ap}` };
});

export const dateOf = (v: string) => (v || "").slice(0, 10);
export const timeOf = (v: string) => (v && v.length >= 16 ? v.slice(11, 16) : "");
export const composeDT = (date: string, time: string, allDay: boolean) =>
  !date ? "" : allDay ? date : `${date}T${time || "09:00"}`;

export function DateTimeField({
  name, allDay, value, onChange, defaultTime = "09:00",
}: {
  name: string;
  allDay: boolean;
  value: string;
  onChange: (v: string) => void;
  defaultTime?: string;
}) {
  const date = dateOf(value);
  const time = timeOf(value) || defaultTime;
  const hidden = date ? (allDay ? date : composeDT(date, time, false)) : "";
  return (
    <>
      <input type="hidden" name={name} value={hidden} />
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <DatePopover block triggerClassName={FIELD_TRIGGER} value={date || null} onChange={(d) => onChange(allDay ? d : composeDT(d, time, false))} />
        </div>
        {!allDay && (
          <div className="w-[7.5rem] shrink-0">
            <FluidSelect
              value={time}
              options={TIME_OPTS}
              onSelect={(t) => onChange(composeDT(date || dateOf(value), t, false))}
              buttonClassName={`${FIELD_TRIGGER} flex w-full items-center justify-between`}
            />
          </div>
        )}
      </div>
    </>
  );
}
