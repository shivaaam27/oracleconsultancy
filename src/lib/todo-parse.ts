/**
 * Lightweight natural-language parsing for the quick-add to-do box.
 * Pulls a date, time and company out of free text so
 *   "Pay VAT friday 2pm #Dar Spices"
 * becomes { title: "Pay VAT", date: "2025-…-…", time: "14:00", companyId }.
 *
 * Deliberately small and predictable (no external NLP). British English.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

export type ParsedTodo = { title: string; date: string | null; time: string | null; companyId: number | null };

/** Next occurrence of `weekday` (0–6). `forceNext` skips today even if it matches. */
function nextWeekday(weekday: number, forceNext: boolean): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let diff = (weekday - d.getDay() + 7) % 7;
  if (diff === 0 && forceNext) diff = 7;
  if (diff === 0 && !forceNext) diff = 0; // today
  d.setDate(d.getDate() + diff);
  return d;
}

export function parseTodo(raw: string, companies: { id: number; name: string }[]): ParsedTodo {
  let text = ` ${raw} `;
  let date: string | null = null;
  let time: string | null = null;
  let companyId: number | null = null;

  // --- Company: a "#name" / "@name" tag, matched against the company list. ---
  const tagMatch = text.match(/[#@]\s*([A-Za-z0-9'’&.\- ]+?)\s*$/);
  if (tagMatch) {
    const phrase = tagMatch[1].trim().toLowerCase();
    const hit = companies.find((c) => c.name.toLowerCase().includes(phrase) || phrase.includes(c.name.toLowerCase()));
    if (hit) { companyId = hit.id; text = text.replace(tagMatch[0], " "); }
  }

  // --- Time: "2pm", "2:30pm", "14:00". ---
  const t12 = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (t12) {
    let h = parseInt(t12[1], 10) % 12;
    if (/pm/i.test(t12[3])) h += 12;
    time = `${pad(h)}:${t12[2] ? t12[2] : "00"}`;
    text = text.replace(t12[0], " ");
  } else {
    const t24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (t24) { time = `${pad(parseInt(t24[1], 10))}:${t24[2]}`; text = text.replace(t24[0], " "); }
  }

  // --- Date keywords. ---
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const setDate = (d: Date) => { date = localDate(d); };

  if (/\btoday\b/i.test(text) || /\btonight\b/i.test(text)) { setDate(today); text = text.replace(/\b(today|tonight)\b/i, " "); }
  else if (/\btomorrow\b/i.test(text) || /\btmrw\b/i.test(text)) { const d = new Date(today); d.setDate(d.getDate() + 1); setDate(d); text = text.replace(/\b(tomorrow|tmrw)\b/i, " "); }
  else if (/\bnext week\b/i.test(text)) { const d = nextWeekday(1, true); setDate(d); text = text.replace(/\bnext week\b/i, " "); }
  else {
    const inDays = text.match(/\bin (\d{1,2}) days?\b/i);
    if (inDays) { const d = new Date(today); d.setDate(d.getDate() + parseInt(inDays[1], 10)); setDate(d); text = text.replace(inDays[0], " "); }
    else {
      const wd = text.match(/\b(next\s+)?(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/i);
      if (wd) { setDate(nextWeekday(WEEKDAYS[wd[2].toLowerCase()], !!wd[1])); text = text.replace(wd[0], " "); }
    }
  }

  const title = text.replace(/\s{2,}/g, " ").trim().replace(/[#@\s]+$/, "").trim();
  return { title: title || raw.trim(), date, time, companyId };
}
