// event-read-core.ts — the PURE half of reading a document into a diary entry.
//
// No database, no network, no model, no `server-only`: everything here is
// arithmetic and string-shaping, so it can be unit-tested directly and imported
// from a client component to show the owner what was read before saving.
// The half that actually calls the model lives in event-read.ts.
//
// The hard problem this file exists for is TIME ZONES. A flight leaves Dar at
// 02:15 and lands in Dubai at 08:40 — two wall clocks, two zones, and taking
// either at face value puts the director at the airport on the wrong hour. So a
// time is never accepted as a bare number: it always travels with the zone it
// was printed in, and is converted to a real instant here.

/* ------------------------------------------------------------------ */
/* Time zones                                                          */
/* ------------------------------------------------------------------ */

/** True if the runtime recognises this IANA zone name ("Asia/Dubai"). A model
 *  can invent a plausible-looking zone, and an invented zone silently shifts
 *  the event — so anything unrecognised is rejected rather than guessed at. */
export function isValidTimeZone(tz: string | null | undefined): boolean {
  const s = (tz ?? "").trim();
  if (!s || !s.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: s });
    return true;
  } catch {
    return false;
  }
}

/** Minutes `tz` is ahead of UTC at a given instant (negative = behind). */
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  // hour12:false yields "24" for midnight in some engines — fold it back to 0.
  const asIfUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second);
  return (asIfUtc - at.getTime()) / 60_000;
}

/**
 * "2026-09-03T02:15" printed on a ticket, in zone `tz` → the real UTC instant.
 *
 * Two passes: the first offset is looked up using the naive time, the second
 * using the instant that produced — which settles the case where the offset
 * itself changes across the moment in question (a daylight-saving boundary).
 * Returns null for anything that isn't a parseable local date-time in a zone
 * the runtime knows, so a bad read can never quietly become a wrong hour.
 */
export function zonedLocalToUtc(local: string | null | undefined, tz: string | null | undefined): string | null {
  const s = (local ?? "").trim();
  const zone = (tz ?? "").trim();
  if (!s || !isValidTimeZone(zone)) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const year = +y;
  if (year < 1900 || year > 2200) return null;
  const naive = Date.UTC(year, +mo - 1, +d, +h, +mi);
  if (!Number.isFinite(naive)) return null;

  let utc = naive - tzOffsetMinutes(new Date(naive), zone) * 60_000;
  utc = naive - tzOffsetMinutes(new Date(utc), zone) * 60_000;
  const out = new Date(utc);
  return isNaN(out.getTime()) ? null : out.toISOString();
}

/** "Wed 3 Sep 2026, 02:15" as read in a particular zone — for showing the owner
 *  the time back in the zone it was PRINTED in, not in Dar es Salaam. */
export function fmtInZone(iso: string, tz: string, opts?: { dateOnly?: boolean }): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: isValidTimeZone(tz) ? tz : "UTC",
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    ...(opts?.dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
}

/** Short zone label for a confirmation line: "Asia/Dubai" → "Dubai time". */
export function zoneLabel(tz: string | null | undefined): string {
  const s = (tz ?? "").trim();
  if (!s) return "";
  if (s === "Africa/Dar_es_Salaam") return "EAT";
  const city = s.split("/").pop() ?? s;
  return `${city.replace(/_/g, " ")} time`;
}

/* ------------------------------------------------------------------ */
/* What a read can come back with                                      */
/* ------------------------------------------------------------------ */

export const EVENT_KINDS = ["flight", "hotel", "meeting", "appointment", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type Place = {
  /** Airport/station code as printed ("DAR", "DXB"). */
  code: string | null;
  /** City or venue name ("Dar es Salaam", "Julius Nyerere Intl"). */
  name: string | null;
  terminal: string | null;
};

export type FlightDetails = {
  airline: string | null;
  flightNo: string | null;
  bookingRef: string | null;
  ticketNo: string | null;
  from: Place;
  to: Place;
  /** Local wall-clock time printed at the DEPARTURE airport, and its zone. */
  boardingLocal: string | null;
  gate: string | null;
  seat: string | null;
  cabin: string | null;
  baggage: string | null;
  passenger: string | null;
};

export type EventReadFields = {
  kind: EventKind;
  title: string | null;
  /** Local wall-clock as printed, plus the zone it was printed in. */
  startLocal: string | null;
  startTimeZone: string | null;
  endLocal: string | null;
  endTimeZone: string | null;
  allDay: boolean;
  location: string | null;
  /** Free prose for anything that isn't a flight/hotel. */
  summary: string | null;
  reference: string | null;
  flight: FlightDetails | null;
};

/** The read, resolved into what the event form actually needs. */
export type EventReadResolved = {
  fields: EventReadFields;
  /** Real instants, or null when the times couldn't be trusted. */
  startAt: string | null;
  endAt: string | null;
  /** The composed description — what goes in the event body. */
  description: string;
  /** Suggested "minutes before start" alarms, derived from what was printed. */
  reminders: number[];
  /** One line the owner reads back before saving ("Departs 02:15 EAT · arrives 08:40 Dubai time"). */
  whenSummary: string | null;
  /** Anything the model left blank that matters — shown as a nudge, not an error. */
  gaps: string[];
};

/* ------------------------------------------------------------------ */
/* Normalising the model's answer                                      */
/* ------------------------------------------------------------------ */

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s || /^(null|n\/a|na|none|unknown|not stated|not specified|tbc|tba|-)$/i.test(s)) return null;
  return s;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function toPlace(v: unknown): Place {
  const o = obj(v);
  return { code: str(o.code), name: str(o.name), terminal: str(o.terminal) };
}

/** A local date-time as printed: "YYYY-MM-DDTHH:mm". Rejects anything else so a
 *  half-read date ("03/09") never becomes a confident wrong time. */
function localDateTime(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const year = +m[1];
  if (year < 1900 || year > 2200) return null;
  const hh = m[4] ?? "00";
  const mm = m[5] ?? "00";
  if (+m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +hh > 23 || +mm > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${hh}:${mm}`;
}

/**
 * A baggage allowance, or nothing.
 *
 * Found in live testing on a real Air Tanzania ticket: the columns on an e-ticket
 * run together when the PDF is flattened ("G 2 PCOOK 07DEC26 5BGRT3MAF"), and the
 * model returned the FARE BASIS code `5BGRT3MAF` as the baggage allowance. A real
 * allowance always says how much of what — "2 PC", "30K", "2 x 23 kg" — so
 * anything that doesn't is a column mix-up, and a confidently wrong allowance in
 * the director's calendar is worse than no line at all.
 */
const BAGGAGE_RE = /\d+\s*(?:x\s*\d+\s*)?(?:kgs?|kilos?|k|lbs?|pcs?|pieces?|bags?)\b|\bno\s+(?:checked\s+)?bag/i;

function baggageAllowance(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return BAGGAGE_RE.test(s) ? s : null;
}

/** A bare "HH:mm" (a boarding time, printed without a date). */
function clockTime(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const timeZone = (v: unknown): string | null => {
  const s = str(v);
  return s && isValidTimeZone(s) ? s : null;
};

export function normaliseEventRead(data: Record<string, unknown> | null): EventReadFields {
  const d = obj(data);
  const rawKind = (str(d.kind) ?? "other").toLowerCase();
  const kind = (EVENT_KINDS as readonly string[]).includes(rawKind) ? (rawKind as EventKind) : "other";

  const f = obj(d.flight);
  const hasFlight = kind === "flight" || !!str(f.flightNo);

  return {
    kind,
    title: str(d.title),
    startLocal: localDateTime(d.startLocal),
    startTimeZone: timeZone(d.startTimeZone),
    endLocal: localDateTime(d.endLocal),
    endTimeZone: timeZone(d.endTimeZone),
    allDay: d.allDay === true,
    location: str(d.location),
    summary: str(d.summary),
    reference: str(d.reference),
    flight: hasFlight
      ? {
          airline: str(f.airline),
          flightNo: str(f.flightNo),
          bookingRef: str(f.bookingRef),
          ticketNo: str(f.ticketNo),
          from: toPlace(f.from),
          to: toPlace(f.to),
          boardingLocal: clockTime(f.boardingLocal),
          gate: str(f.gate),
          seat: str(f.seat),
          cabin: str(f.cabin),
          baggage: baggageAllowance(f.baggage),
          passenger: str(f.passenger),
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Composing the description                                           */
/* ------------------------------------------------------------------ */

function placeLabel(p: Place): string {
  const bits = [p.name, p.code ? `(${p.code})` : null].filter(Boolean).join(" ");
  return [bits || p.code || "", p.terminal ? `Terminal ${p.terminal.replace(/^t(erminal)?\s*/i, "")}` : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * "Label: value" lines, one per line.
 *
 * These were once padded with spaces into aligned columns. That looked right in
 * a code editor and NOWHERE ELSE: HTML collapses runs of spaces before drawing
 * them, and both the email and the Google Calendar description use a
 * proportional font, where space-padding cannot align anything anyway. The
 * padding was invisible in every place this text is actually read.
 *
 * A colon does the same job honestly, and the email renders these as proper
 * label/value rows on top.
 */
function rows(pairs: Array<[string, string | null]>): string {
  return pairs
    .filter((p): p is [string, string] => !!p[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/**
 * Build the event body from what was read. For a flight this is deliberately
 * shaped like the airline's own summary — the details he'd have got had the
 * booking email reached him directly, in the order he'd look for them.
 */
export function composeDescription(fields: EventReadFields, resolved?: { startAt?: string | null; endAt?: string | null }): string {
  const parts: string[] = [];

  if (fields.flight) {
    const f = fields.flight;
    const head = [f.airline, f.flightNo].filter(Boolean).join(" ");
    if (head) parts.push(head);

    const route = [placeLabel(f.from), placeLabel(f.to)].filter(Boolean).join("  →  ");
    if (route) parts.push(route);

    const depart = resolved?.startAt && fields.startTimeZone
      ? `${fmtInZone(resolved.startAt, fields.startTimeZone)} (${zoneLabel(fields.startTimeZone)})`
      : null;
    const arrive = resolved?.endAt && fields.endTimeZone
      ? `${fmtInZone(resolved.endAt, fields.endTimeZone)} (${zoneLabel(fields.endTimeZone)})`
      : null;

    const detail = rows([
      ["Departs", depart],
      ["Arrives", arrive],
      ["Boarding", f.boardingLocal ? `${f.boardingLocal} (${zoneLabel(fields.startTimeZone)})` : null],
      ["Gate", f.gate],
      // Without a seat number this row is really the cabin, and labelling
      // "Economy" as a Seat reads like a mistake on the ticket.
      [f.seat ? "Seat" : "Class", [f.seat, f.cabin].filter(Boolean).join(" · ") || null],
      ["Booking", [f.bookingRef, f.ticketNo ? `e-ticket ${f.ticketNo}` : null].filter(Boolean).join(" · ") || null],
      ["Passenger", f.passenger],
      ["Baggage", f.baggage],
    ]);
    if (detail) parts.push(detail);

    // The other legs. The prompt asks for a return or connection to be described
    // in `summary`, and this branch used to drop it on the floor — so a return
    // ticket lost its return entirely. That is the half of the booking the
    // traveller most needs to know about.
    if (fields.summary) parts.push(fields.summary);
  } else {
    if (fields.summary) parts.push(fields.summary);
    const detail = rows([
      ["Where", fields.location],
      ["Reference", fields.reference],
    ]);
    if (detail && !fields.flight) parts.push(detail);
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_REMINDERS: Record<EventKind, number[]> = {
  flight: [1440, 180], // the day before, and three hours out (leave for the airport)
  hotel: [1440],
  meeting: [1440, 30],
  appointment: [1440, 60],
  other: [1440],
};

/**
 * Suggested alarms, in minutes before the event starts. For a flight the
 * boarding time printed on the ticket becomes a real alarm — that is the moment
 * that actually matters, and it is the one no generic reminder would ever know.
 * Suggestions only: the form shows them ticked and the owner can untick any.
 */
export function suggestReminders(fields: EventReadFields, startAt: string | null): number[] {
  const base = [...(DEFAULT_REMINDERS[fields.kind] ?? DEFAULT_REMINDERS.other)];

  const boarding = fields.flight?.boardingLocal;
  if (boarding && startAt && fields.startTimeZone) {
    // Boarding is printed as a bare clock time on the departure DATE.
    const day = (fields.startLocal ?? "").slice(0, 10);
    const boardingUtc = day ? zonedLocalToUtc(`${day}T${boarding}`, fields.startTimeZone) : null;
    if (boardingUtc) {
      const mins = Math.round((new Date(startAt).getTime() - new Date(boardingUtc).getTime()) / 60_000);
      // Only trust a gap that looks like real boarding (5 min–3 h before departure).
      if (mins >= 5 && mins <= 180) base.push(mins);
    }
  }

  return [...new Set(base.filter((m) => Number.isFinite(m) && m >= 0))].sort((a, b) => b - a);
}

/* ------------------------------------------------------------------ */
/* Resolving a read into event fields                                  */
/* ------------------------------------------------------------------ */

/**
 * Turn a normalised read into what the form needs: real instants, a composed
 * description, suggested alarms, and an honest list of what was NOT on the page.
 * Nothing here decides anything — it hands the owner a filled-in form.
 */
export function resolveEventRead(fields: EventReadFields): EventReadResolved {
  const startAt = fields.allDay
    ? fields.startLocal
      ? `${fields.startLocal.slice(0, 10)}T00:00:00.000Z`
      : null
    : zonedLocalToUtc(fields.startLocal, fields.startTimeZone);

  const endRaw = fields.allDay
    ? fields.endLocal
      ? `${fields.endLocal.slice(0, 10)}T00:00:00.000Z`
      : null
    : zonedLocalToUtc(fields.endLocal, fields.endTimeZone ?? fields.startTimeZone);

  // An arrival that lands before departure is a misread (usually a missing
  // next-day date on an overnight flight), not a fact worth storing.
  const endAt = endRaw && startAt && new Date(endRaw).getTime() <= new Date(startAt).getTime() ? null : endRaw;

  const description = composeDescription(fields, { startAt, endAt });

  const gaps: string[] = [];
  if (!startAt) gaps.push(fields.startLocal ? "the time zone of the start time" : "the start date/time");
  if (fields.kind === "flight" && !endAt) gaps.push("the arrival time");
  if (endRaw && !endAt) gaps.push("a sensible arrival time (it read as before departure)");

  const whenSummary =
    startAt && fields.startTimeZone
      ? [
          `${fmtInZone(startAt, fields.startTimeZone)} (${zoneLabel(fields.startTimeZone)})`,
          endAt && fields.endTimeZone
            ? `arrives ${fmtInZone(endAt, fields.endTimeZone)} (${zoneLabel(fields.endTimeZone)})`
            : null,
        ]
          .filter(Boolean)
          .join(" → ")
      : null;

  return {
    fields,
    startAt,
    endAt,
    description,
    reminders: suggestReminders(fields, startAt),
    whenSummary,
    gaps,
  };
}

/**
 * A default title when the document names itself poorly.
 *
 * Deliberately SHORT: this is the event's name, so it has to survive a calendar
 * day view on a phone as well as an email subject line. Airport codes, not city
 * names — "Flight TC 206 · DAR → JNB" is 25 characters where
 * "Flight TC 206 Dar es Salaam → Johannesburg" is 42, and codes are how a
 * boarding pass and a departure board write it anyway.
 *
 * The traveller's name is NOT included. On the traveller's own calendar it is
 * noise, and it is in the details of every email regardless; add it by hand when
 * filing someone else's trip into a shared diary.
 */
export function fallbackTitle(fields: EventReadFields): string | null {
  if (fields.title) return fields.title;
  const f = fields.flight;
  if (f) {
    // Prefer the code ("DAR"); fall back to the place name only if there isn't one.
    const route = [f.from.code ?? f.from.name, f.to.code ?? f.to.name].filter(Boolean).join(" → ");
    const no = f.flightNo ?? null;
    const head = no ? `Flight ${no}` : "Flight";
    if (route) return `${head} · ${route}`;
    if (no) return head;
  }
  return null;
}
