import { describe, it, expect } from "vitest";
import {
  isValidTimeZone,
  zonedLocalToUtc,
  zoneLabel,
  normaliseEventRead,
  resolveEventRead,
  composeDescription,
  suggestReminders,
  fallbackTitle,
} from "./event-read-core";

// A realistic overnight Emirates ticket: Dar es Salaam → Dubai, departing
// 02:15 EAT (UTC+3) and landing 08:40 Dubai time (UTC+4) the same morning.
const TICKET = {
  kind: "flight",
  title: "Flight EK 726 Dar es Salaam → Dubai",
  startLocal: "2026-09-03T02:15",
  startTimeZone: "Africa/Dar_es_Salaam",
  endLocal: "2026-09-03T08:40",
  endTimeZone: "Asia/Dubai",
  allDay: false,
  location: "Julius Nyerere International (DAR), Terminal 2",
  flight: {
    airline: "Emirates",
    flightNo: "EK 726",
    bookingRef: "K3P9QX",
    ticketNo: "176-2345678901",
    from: { code: "DAR", name: "Dar es Salaam", terminal: "2" },
    to: { code: "DXB", name: "Dubai", terminal: "3" },
    boardingLocal: "01:30",
    gate: null,
    seat: "14A",
    cabin: "Economy",
    baggage: "2 x 23 kg",
    passenger: "MR SHIVAM PARMAR",
  },
  confidence: 0.92,
};

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Africa/Dar_es_Salaam")).toBe(true);
    expect(isValidTimeZone("Asia/Dubai")).toBe(true);
    expect(isValidTimeZone("Europe/London")).toBe(true);
  });

  it("rejects invented or abbreviated zones", () => {
    // A model will happily return "EAT" or "GMT+3" — neither is convertible, and
    // accepting one would shift the event by whatever the server's zone happens
    // to be.
    expect(isValidTimeZone("EAT")).toBe(false);
    expect(isValidTimeZone("GMT+3")).toBe(false);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe("zonedLocalToUtc", () => {
  it("converts a Dar es Salaam wall clock (UTC+3, no DST)", () => {
    expect(zonedLocalToUtc("2026-09-03T02:15", "Africa/Dar_es_Salaam")).toBe("2026-09-02T23:15:00.000Z");
  });

  it("converts a Dubai wall clock (UTC+4)", () => {
    expect(zonedLocalToUtc("2026-09-03T08:40", "Asia/Dubai")).toBe("2026-09-03T04:40:00.000Z");
  });

  it("honours British Summer Time", () => {
    // 15:00 in London on 1 July is UTC+1 — a naive parse would be an hour out.
    expect(zonedLocalToUtc("2026-07-01T15:00", "Europe/London")).toBe("2026-07-01T14:00:00.000Z");
    // …and UTC+0 in January.
    expect(zonedLocalToUtc("2026-01-15T15:00", "Europe/London")).toBe("2026-01-15T15:00:00.000Z");
  });

  it("handles a zone behind UTC", () => {
    expect(zonedLocalToUtc("2026-09-03T09:00", "America/New_York")).toBe("2026-09-03T13:00:00.000Z");
  });

  it("refuses a time with no usable zone rather than guessing", () => {
    expect(zonedLocalToUtc("2026-09-03T02:15", "EAT")).toBeNull();
    expect(zonedLocalToUtc("2026-09-03T02:15", null)).toBeNull();
    expect(zonedLocalToUtc("not a date", "Asia/Dubai")).toBeNull();
    expect(zonedLocalToUtc(null, "Asia/Dubai")).toBeNull();
  });

  it("refuses a year that is obviously a misread", () => {
    expect(zonedLocalToUtc("0203-09-03T02:15", "Asia/Dubai")).toBeNull();
  });
});

describe("normaliseEventRead", () => {
  it("keeps only what was actually printed", () => {
    const f = normaliseEventRead(TICKET);
    expect(f.kind).toBe("flight");
    expect(f.flight?.flightNo).toBe("EK 726");
    expect(f.flight?.seat).toBe("14A");
    // The model returned null for the gate — it must stay null, not "TBC".
    expect(f.flight?.gate).toBeNull();
  });

  it("treats filler words as blanks", () => {
    const f = normaliseEventRead({ ...TICKET, flight: { ...TICKET.flight, gate: "TBC", seat: "N/A" } });
    expect(f.flight?.gate).toBeNull();
    expect(f.flight?.seat).toBeNull();
  });

  it("drops an invented time zone, and the time with it", () => {
    const f = normaliseEventRead({ ...TICKET, startTimeZone: "GMT+3" });
    expect(f.startTimeZone).toBeNull();
    expect(resolveEventRead(f).startAt).toBeNull();
  });

  it("falls back to 'other' for an unknown kind", () => {
    expect(normaliseEventRead({ kind: "wedding" }).kind).toBe("other");
    expect(normaliseEventRead(null).kind).toBe("other");
  });
});

describe("resolveEventRead", () => {
  it("resolves both legs of a two-zone flight to the right instants", () => {
    const r = resolveEventRead(normaliseEventRead(TICKET));
    expect(r.startAt).toBe("2026-09-02T23:15:00.000Z");
    expect(r.endAt).toBe("2026-09-03T04:40:00.000Z");
    // 5h25 in the air. Reading both clocks in one zone would give 6h25 — an
    // hour of flight that doesn't exist, because Dubai is an hour ahead.
    const minutes = (new Date(r.endAt!).getTime() - new Date(r.startAt!).getTime()) / 60_000;
    expect(minutes).toBe(325);
    expect(r.gaps).toEqual([]);
  });

  it("shows the owner each time in the zone it was printed in", () => {
    const r = resolveEventRead(normaliseEventRead(TICKET));
    expect(r.whenSummary).toContain("02:15");
    expect(r.whenSummary).toContain("EAT");
    expect(r.whenSummary).toContain("08:40");
    expect(r.whenSummary).toContain("Dubai time");
  });

  it("rejects an arrival that reads as before departure", () => {
    // The classic overnight misread: arrival time picked up, next-day date missed.
    const r = resolveEventRead(normaliseEventRead({ ...TICKET, endLocal: "2026-09-02T08:40" }));
    expect(r.endAt).toBeNull();
    expect(r.gaps.join(" ")).toContain("before departure");
  });

  it("reports a missing zone as a gap instead of failing", () => {
    const r = resolveEventRead(normaliseEventRead({ ...TICKET, startTimeZone: null }));
    expect(r.startAt).toBeNull();
    expect(r.gaps.length).toBeGreaterThan(0);
  });

  it("anchors an all-day entry at UTC midnight, app-wide convention", () => {
    const r = resolveEventRead(
      normaliseEventRead({ kind: "other", allDay: true, startLocal: "2026-09-03T00:00", title: "Public holiday" })
    );
    expect(r.startAt).toBe("2026-09-03T00:00:00.000Z");
  });
});

describe("composeDescription", () => {
  it("reads like the airline's own summary", () => {
    const f = normaliseEventRead(TICKET);
    const r = resolveEventRead(f);
    const body = composeDescription(f, { startAt: r.startAt, endAt: r.endAt });
    expect(body).toContain("Emirates EK 726");
    expect(body).toContain("Dar es Salaam (DAR) · Terminal 2");
    expect(body).toContain("Dubai (DXB) · Terminal 3");
    expect(body).toContain("Boarding: 01:30");
        expect(body).toContain("K3P9QX");
    expect(body).toContain("14A");
    // Nothing was printed about a gate, so no Gate line at all.
    expect(body).not.toContain("Gate");
  });

  // All three of these came out of a real Air Tanzania e-ticket (DAR→JNB,
  // booking 1C9MSZ) during the first live run.
  it("rejects a fare-basis code masquerading as a baggage allowance", () => {
    // The PDF's columns run together ("G 2 PCOOK 07DEC26 5BGRT3MAF") and the
    // model returned the fare basis as the allowance.
    const f = normaliseEventRead({ ...TICKET, flight: { ...TICKET.flight, baggage: "5BGRT3MAF" } });
    expect(f.flight?.baggage).toBeNull();
    expect(composeDescription(f)).not.toContain("5BGRT3MAF");
  });

  it("keeps a real baggage allowance in any of its usual forms", () => {
    for (const good of ["2 PC", "2 x 23 kg", "30K", "1 piece", "23kg", "2 bags"]) {
      const f = normaliseEventRead({ ...TICKET, flight: { ...TICKET.flight, baggage: good } });
      expect(f.flight?.baggage).toBe(good);
    }
  });

  it("labels the cabin as Class when no seat number was printed", () => {
    const f = normaliseEventRead({ ...TICKET, flight: { ...TICKET.flight, seat: null, cabin: "Economy" } });
    const body = composeDescription(f);
    expect(body).toContain("Class: Economy");
    expect(body).not.toContain("Seat: Economy");
  });

  it("still says Seat when there is a seat number", () => {
    expect(composeDescription(normaliseEventRead(TICKET))).toContain("Seat: 14A");
  });

  it("keeps the return leg — a return ticket must not lose its return", () => {
    const f = normaliseEventRead({
      ...TICKET,
      summary: "Return: TC 209 Johannesburg (JNB) to Dar es Salaam (DAR), 12 Sep 2026, 14:15–18:40.",
    });
    const body = composeDescription(f, { startAt: "2026-09-02T23:15:00.000Z", endAt: "2026-09-03T04:40:00.000Z" });
    expect(body).toContain("TC 209");
    expect(body).toContain("12 Sep 2026");
  });

  it("falls back to prose for a non-flight", () => {
    const f = normaliseEventRead({
      kind: "appointment",
      summary: "Immigration interview for the work-permit renewal. Bring the original passport.",
      location: "Immigration HQ, Dar es Salaam",
      reference: "WP/2026/4417",
    });
    const body = composeDescription(f);
    expect(body).toContain("Immigration interview");
    expect(body).toContain("WP/2026/4417");
  });
});

describe("suggestReminders", () => {
  it("turns the printed boarding time into a real alarm", () => {
    const f = normaliseEventRead(TICKET);
    const r = resolveEventRead(f);
    // Boarding 01:30 against a 02:15 departure = 45 minutes before.
    expect(suggestReminders(f, r.startAt)).toContain(45);
    expect(suggestReminders(f, r.startAt)).toContain(180);
    expect(suggestReminders(f, r.startAt)).toContain(1440);
  });

  it("ignores a boarding time that can't be right", () => {
    const f = normaliseEventRead({ ...TICKET, flight: { ...TICKET.flight, boardingLocal: "19:00" } });
    const r = resolveEventRead(f);
    // 19:00 the previous evening against an 02:15 departure isn't a boarding gap.
    expect(suggestReminders(f, r.startAt)).toEqual([1440, 180]);
  });

  it("is sorted furthest-out first and never duplicates", () => {
    const mins = suggestReminders(normaliseEventRead(TICKET), resolveEventRead(normaliseEventRead(TICKET)).startAt);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
    expect(new Set(mins).size).toBe(mins.length);
  });
});

describe("fallbackTitle", () => {
  it("keeps the title the document gave", () => {
    expect(fallbackTitle(normaliseEventRead(TICKET))).toBe("Flight EK 726 Dar es Salaam → Dubai");
  });

  it("builds a SHORT one from the route when the document didn't name itself", () => {
    // It has to survive a calendar day view on a phone, not just an email
    // subject — so airport codes, no airline name, no passenger.
    const t = fallbackTitle(normaliseEventRead({ ...TICKET, title: null }))!;
    expect(t).toBe("Flight EK 726 · DAR → DXB");
    expect(t.length).toBeLessThanOrEqual(30);
    expect(t).not.toContain("Emirates");
    expect(t).not.toContain("SHIVAM");
  });

  it("falls back to place names only when a code wasn't printed", () => {
    const f = normaliseEventRead({
      ...TICKET, title: null,
      flight: { ...TICKET.flight, from: { code: null, name: "Dar es Salaam", terminal: null }, to: { code: "DXB", name: "Dubai", terminal: null } },
    });
    expect(fallbackTitle(f)).toBe("Flight EK 726 · Dar es Salaam → DXB");
  });

  it("returns null rather than inventing a name", () => {
    expect(fallbackTitle(normaliseEventRead({ kind: "other" }))).toBeNull();
  });
});

describe("zoneLabel", () => {
  it("uses the local shorthand at home and the city elsewhere", () => {
    expect(zoneLabel("Africa/Dar_es_Salaam")).toBe("EAT");
    expect(zoneLabel("Asia/Dubai")).toBe("Dubai time");
    expect(zoneLabel("America/New_York")).toBe("New York time");
  });
});
