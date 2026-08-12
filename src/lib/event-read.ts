import "server-only";

// event-read.ts — read ONE attached file and fill in a DIARY ENTRY.
//
// The sibling of doc-read.ts. Same files, same extractor, same "read and
// suggest, never decide" rule — a different question:
//
//   doc-read asks   "what kind of document is this, and when does it expire?"
//   event-read asks "when is this happening, where, and what does he need to know?"
//
// It exists because the owner books the director's travel and gets the airline's
// email himself. Attaching that ticket to an event should put the flight in the
// director's diary as completely as if the airline had emailed HIM: departure in
// the right zone, arrival, terminal, boarding time, seat, booking reference.
//
// What it does NOT do, deliberately (the Aug 2026 rule):
//   • it never writes to the database — it hands fields back to the form;
//   • it never files, renames, archives or de-duplicates anything;
//   • it never invents a time. A time with no zone is REFUSED, not guessed,
//     because a wrong hour on a flight is worse than a blank field.

import { callAIJson, LOW_CONFIDENCE } from "@/lib/ai-json";
import { AI_SMART, providerVisionModels } from "@/lib/ai-models";
import { getAiKey, getActiveProvider } from "@/lib/settings";
import { extractFile } from "@/lib/file-extract";
import {
  normaliseEventRead,
  resolveEventRead,
  fallbackTitle,
  type EventReadResolved,
} from "@/lib/event-read-core";

export type EventReadResult = {
  ok: boolean;
  /** Null when nothing could be read. */
  read: EventReadResolved | null;
  /** A title suggestion, already falling back to "Flight EK 726 DAR → DXB". */
  title: string | null;
  /** How it was read — so a guess never looks like a fact. */
  source: "typed" | "scan" | "none";
  confidence: number | null;
  note?: string;
};

const fail = (note: string, source: EventReadResult["source"] = "none"): EventReadResult => ({
  ok: false, read: null, title: null, source, confidence: null, note,
});

/* ------------------------------------------------------------------ */
/* The prompt                                                          */
/* ------------------------------------------------------------------ */

// Two things carry all the weight here:
//
//  1. TIME ZONES. Every time on a ticket is printed in the LOCAL time of the
//     place it happens — departure in the departure city's zone, arrival in the
//     arrival city's zone. The model is asked for the wall clock exactly as
//     printed PLUS the IANA zone, and event-read-core converts. It is told
//     explicitly not to do the conversion itself, because a model doing mental
//     arithmetic across zones is precisely how a 02:15 flight becomes 05:15.
//
//  2. NOT INVENTING. Every field may be null. A blank the owner fills in takes
//     ten seconds; a confident wrong gate number is discovered at the airport.
const PROMPT = [
  "You are reading ONE document so it can be put in a business diary. British English.",
  "",
  "It may be an airline ticket or boarding pass, a hotel booking, an appointment",
  "letter, a summons, an invitation, an agenda, or something else entirely.",
  "",
  "Return ONLY this JSON object, no prose:",
  "{",
  '  "kind": "flight | hotel | meeting | appointment | other",',
  '  "title": "a SHORT diary title — aim for under 30 characters, because it has to be readable in a calendar day view on a phone. For a flight use the airport CODES, not city names: \\"Flight EK 726 · DAR → DXB\\". For a hotel: \\"Hyatt Regency, Dubai\\". Do NOT put the traveller\'s name in the title.",',
  '  "startLocal": "YYYY-MM-DDTHH:mm — the LOCAL wall-clock time printed where it STARTS, or null",',
  '  "startTimeZone": "IANA zone of that place, e.g. \\"Africa/Dar_es_Salaam\\", or null",',
  '  "endLocal": "YYYY-MM-DDTHH:mm — the LOCAL wall-clock time printed where it ENDS, or null",',
  '  "endTimeZone": "IANA zone of THAT place (often different), e.g. \\"Asia/Dubai\\", or null",',
  '  "allDay": false,',
  '  "location": "where it happens — airport and terminal, hotel name and address, office",',
  '  "summary": "For a FLIGHT: use this ONLY to note the other legs (the return or any connection), e.g. \\"Returns TC 209 Johannesburg to Dar es Salaam, 12 Sep 2026, 14:15-18:40.\\" — null if there is only one leg. Otherwise: 2-4 plain sentences of what this is and what the person needs to know.",',
  '  "reference": "the booking/case/reference number, if any",',
  '  "flight": {',
  '    "airline": "e.g. \\"Emirates\\"", "flightNo": "e.g. \\"EK 726\\"",',
  '    "bookingRef": "PNR / booking reference", "ticketNo": "e-ticket number",',
  '    "from": { "code": "DAR", "name": "Dar es Salaam", "terminal": "2" },',
  '    "to":   { "code": "DXB", "name": "Dubai",         "terminal": "3" },',
  '    "boardingLocal": "HH:mm boarding time printed at the DEPARTURE airport, or null",',
  '    "gate": "departure gate if printed", "seat": "e.g. \\"14A\\"",',
  '    "cabin": "e.g. \\"Economy\\"", "baggage": "the ALLOWANCE only, e.g. \\"2 PC\\" or \\"2 x 23 kg\\" — never the fare-basis code",',
  '    "passenger": "the traveller\'s name as printed"',
  "  },",
  '  "confidence": 0.0',
  "}",
  "",
  "TIME ZONES — the most important rule:",
  "- Give each time EXACTLY as printed on the document. Do NOT convert anything.",
  "- Give the IANA zone of the PLACE that time belongs to. A flight's departure",
  "  time is in the departure city's zone; its arrival time is in the ARRIVAL",
  "  city's zone. These are usually different — set both.",
  "- If you cannot tell which zone a time belongs to, set the time to null too.",
  "  A time without its zone is worse than no time at all.",
  "- An overnight flight arrives on the NEXT day: make sure endLocal's date says so.",
  "",
  "Other rules:",
  "- Use null for ANYTHING not clearly printed. NEVER invent a gate, seat, terminal or reference.",
  "- Dates must be real dates read off the document, in YYYY-MM-DD form.",
  "- If the document covers several flights (a return, or a connection), describe ONLY",
  "  the FIRST departing leg, and mention the other legs in \"summary\".",
  "- Set \"flight\" to null unless this really is air travel.",
  "- For a hotel: startLocal is check-in, endLocal is check-out, both in the hotel's zone.",
  "- confidence is YOUR honest 0-1 score for how well you could read this.",
].join("\n");

/* ------------------------------------------------------------------ */
/* The reader                                                          */
/* ------------------------------------------------------------------ */

function shape(data: Record<string, unknown> | null, source: "typed" | "scan", confidence: number | null): EventReadResult {
  const fields = normaliseEventRead(data);
  const read = resolveEventRead(fields);
  return { ok: true, read, title: fallbackTitle(fields), source, confidence };
}

async function readText(text: string, apiKey: string): Promise<EventReadResult> {
  const res = await callAIJson({
    messages: [{ role: "user", content: `${PROMPT}\n\nDOCUMENT TEXT:\n"""\n${text.slice(0, 14000)}\n"""` }],
    apiKey,
    model: AI_SMART,
    maxTokens: 900,
    source: "event-read",
  });
  if (!res.ok) return fail(explain(res.error), "typed");
  return shape(res.data, "typed", res.confidence);
}

async function readImages(imageUrls: string[], apiKey: string): Promise<EventReadResult> {
  const content = [
    { type: "text", text: PROMPT },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  const maxTokens = imageUrls.length <= 1 ? 900 : Math.min(900 + imageUrls.length * 120, 2600);
  // Walk the active provider's vision ladder — an http error (e.g. a
  // decommissioned model) falls through to the next; other errors would recur.
  const models = providerVisionModels(await getActiveProvider());
  let last = await callAIJson({ messages: [{ role: "user", content }], apiKey, model: models[0], maxTokens, source: "event-read" });
  for (const model of models.slice(1)) {
    if (last.ok || last.error !== "http-error") break;
    last = await callAIJson({ messages: [{ role: "user", content }], apiKey, model, maxTokens, source: "event-read" });
  }
  if (!last.ok) return fail(explain(last.error), "scan");
  return shape(last.data, "scan", last.confidence);
}

function explain(error: string | undefined): string {
  switch (error) {
    case "no-key": return "No AI key is set — add one in Settings, or fill the event in yourself.";
    case "spend-cap": return "The monthly AI spend cap has been reached. Fill this one in yourself, or raise the cap in Settings.";
    case "rate-limited": return "The AI is busy right now. Try again in a moment, or fill it in yourself.";
    case "bad-json":
    case "schema": return "Couldn't make sense of what came back. Fill the event in yourself.";
    default: return "Couldn't read this file. Fill it in yourself, or try a clearer scan.";
  }
}

/**
 * Read a file and report what event it describes. Never throws — a failure comes
 * back as `ok: false` with a plain-English note, and the form stays as it was.
 * The file is still attached either way: reading is a convenience, not a gate.
 */
export async function readEventFile(input: File): Promise<EventReadResult> {
  if (!(input instanceof File) || input.size === 0) return fail("No file provided.");

  const apiKey = await getAiKey();
  if (!apiKey) return fail("No AI key is set — add one in Settings, or fill the event in yourself.");

  const extracted = await extractFile(input);
  if (extracted.kind === "none") return fail(extracted.note);
  return extracted.kind === "text"
    ? await readText(extracted.text, apiKey)
    : await readImages(extracted.images, apiKey);
}

/** True when the read was weak enough that the owner should look twice. */
export function isUnsureEventRead(r: EventReadResult): boolean {
  return r.ok && r.confidence != null && r.confidence < LOW_CONFIDENCE;
}
