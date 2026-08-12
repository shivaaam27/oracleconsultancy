import { describe, it, expect } from "vitest";
import { buildIcs, type IcsEvent } from "./ics";

// ATTACH is the paperclip on a calendar entry — how a flight ticket stays one
// tap away in Apple Calendar / Outlook months after the email that carried it.
// It has a rule that catches people out: the VALUE is a URI, and RFC 5545 §3.3.13
// URIs are NOT text-escaped. Running a URL through the normal escaper turns
// every comma into "\," and the link dies. These tests pin that down.

const base: IcsEvent = {
  uid: "abc123@cos-system",
  title: "Flight EK 726 Dar es Salaam → Dubai",
  start: new Date("2026-09-02T23:15:00.000Z"),
  end: new Date("2026-09-03T04:40:00.000Z"),
};

/**
 * Undo RFC 5545 line folding, exactly as a calendar client does before parsing.
 *
 * buildIcs folds every line at 75 octets (a CRLF followed by a single space),
 * which is REQUIRED by the spec — a long attachment URL is always split across
 * several physical lines. Asserting on the raw output would be asserting on
 * where the fold happened, which is not the behaviour we care about.
 */
function lines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

describe("buildIcs — attachments", () => {
  it("emits nothing when there are no attachments", () => {
    expect(buildIcs(base)).not.toContain("ATTACH");
  });

  it("folds a long ATTACH line, and it unfolds back to one property", () => {
    // Proof the fold is a transport detail, not data loss: a 100+ character
    // link comes back whole once unfolded, which is what every client does.
    const url = "https://oracleconsultancy.vercel.app/e/9f2c1b7e-4a6d-4c2e-9b1a-77c0d5e3f412/doc/1284";
    const raw = buildIcs({ ...base, attachments: [{ url, mimeType: "application/pdf", fileName: "e-ticket.pdf" }] });
    expect(raw).toContain("\r\n "); // it really did fold
    expect(lines(raw).find((l) => l.startsWith("ATTACH"))!.endsWith(`:${url}`)).toBe(true);
  });

  it("emits one ATTACH line per paper, with type and file name", () => {
    const ics = buildIcs({
      ...base,
      attachments: [
        { url: "https://oracleconsultancy.vercel.app/e/abc123/doc/42", mimeType: "application/pdf", fileName: "ticket.pdf" },
        { url: "https://oracleconsultancy.vercel.app/e/abc123/doc/43", mimeType: "image/jpeg", fileName: "boarding-pass.jpg" },
      ],
    });
    const attach = lines(ics).filter((l) => l.startsWith("ATTACH"));
    expect(attach).toHaveLength(2);
    expect(attach[0]).toBe(
      'ATTACH;FMTTYPE=application/pdf;FILENAME="ticket.pdf":https://oracleconsultancy.vercel.app/e/abc123/doc/42'
    );
    expect(attach[1]).toContain("image/jpeg");
  });

  it("does NOT escape the URL — a query string must survive intact", () => {
    // The generic text escaper would render this as "...\,x" and break the link.
    const url = "https://example.com/e/tok/doc/7?a=1,2&b=x";
    const ics = buildIcs({ ...base, attachments: [{ url, mimeType: "application/pdf", fileName: "t.pdf" }] });
    const attach = lines(ics).find((l) => l.startsWith("ATTACH"))!;
    expect(attach.endsWith(`:${url}`)).toBe(true);
    expect(attach).not.toContain("\\,");
  });

  it("survives a file name containing a quote or a semicolon", () => {
    // A stray quote would otherwise terminate the parameter early and corrupt
    // the whole VEVENT.
    const ics = buildIcs({
      ...base,
      attachments: [{ url: "https://example.com/f", mimeType: "application/pdf", fileName: 'we"ird;name.pdf' }],
    });
    const attach = lines(ics).find((l) => l.startsWith("ATTACH"))!;
    expect(attach).toBe('ATTACH;FMTTYPE=application/pdf;FILENAME="weird;name.pdf":https://example.com/f');
  });

  it("copes with a missing type or name", () => {
    const ics = buildIcs({ ...base, attachments: [{ url: "https://example.com/f" }] });
    expect(lines(ics)).toContain("ATTACH:https://example.com/f");
  });

  it("skips a blank url rather than emitting a broken line", () => {
    const ics = buildIcs({ ...base, attachments: [{ url: "   ", fileName: "nothing.pdf" }] });
    expect(ics).not.toContain("ATTACH");
  });

  it("keeps the VEVENT well-formed around the attachments", () => {
    const ics = buildIcs({
      ...base,
      attachments: [{ url: "https://example.com/f", mimeType: "application/pdf", fileName: "t.pdf" }],
      organizerEmail: "admin@oracle.co.tz",
      organizerName: "Oracle Consultancy",
    });
    const l = lines(ics);
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("END:VEVENT");
    expect(l).toContain("END:VCALENDAR");
    // ATTACH must sit inside the VEVENT, before the organiser block ends it.
    const attachAt = l.findIndex((x) => x.startsWith("ATTACH"));
    expect(attachAt).toBeGreaterThan(l.indexOf("BEGIN:VEVENT"));
    expect(attachAt).toBeLessThan(l.indexOf("END:VEVENT"));
  });
});
