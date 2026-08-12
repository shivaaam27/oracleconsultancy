// Typing a time, instead of hunting for it in a list.
//
// The event form used a 96-option dropdown (every quarter hour). Measured on the
// real form that is 3,468px of list inside a 501px window, and it opened at
// midnight — 1,446px away from the time actually selected. Changing 10:00 to
// 10:45 meant scrolling most of a day.
//
// So: type it. This module is the parsing half, kept pure so it can be tested
// directly and shared by both event forms.

/** Quarter-hour steps, the values the suggestion list offers. */
export const TIME_STEP_MINUTES = 15;

/**
 * Parse whatever someone typed into "HH:mm", or null if it isn't a time.
 *
 * Deliberately generous, because every one of these is something a person
 * genuinely types when they mean half past two:
 *   "14:30"  "1430"  "2:30pm"  "230 pm"  "2.30 PM"  "14h30"
 * and for the top of an hour:
 *   "9"  "9am"  "09"  "9:00"
 *
 * Rejects anything out of range rather than clamping — "25:00" is a typo, and
 * silently turning it into 23:59 would put an event at the wrong time.
 */
export function parseTimeInput(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;

  // Pull off an am/pm suffix first, so "230pm" splits cleanly.
  const ampmMatch = s.match(/(a\.?m\.?|p\.?m\.?)$/);
  const isPm = !!ampmMatch && ampmMatch[1].startsWith("p");
  const hasAmPm = !!ampmMatch;
  const body = (hasAmPm ? s.slice(0, ampmMatch!.index) : s).trim().replace(/[.\sh]/g, ":").replace(/:+$/, "");

  let hh: number;
  let mm: number;

  const withSep = body.match(/^(\d{1,2}):(\d{1,2})$/);
  const bare = body.match(/^(\d{1,4})$/);

  if (withSep) {
    hh = Number(withSep[1]);
    mm = Number(withSep[2].padEnd(2, "0"));
  } else if (bare) {
    const d = bare[1];
    if (d.length <= 2) {
      hh = Number(d);
      mm = 0;
    } else {
      // "1430" / "930"
      hh = Number(d.slice(0, d.length - 2));
      mm = Number(d.slice(-2));
    }
  } else {
    return null;
  }

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (mm < 0 || mm > 59) return null;

  if (hasAmPm) {
    if (hh < 1 || hh > 12) return null;
    if (isPm && hh !== 12) hh += 12;
    if (!isPm && hh === 12) hh = 0;
  } else if (hh < 0 || hh > 23) {
    return null;
  }

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "14:30" → "2:30 PM". The form shows this; the value stays 24-hour. */
export function formatTimeLabel(value: string | null | undefined): string {
  const v = (value ?? "").match(/^(\d{2}):(\d{2})$/);
  if (!v) return "";
  const h = Number(v[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${v[2]} ${ampm}`;
}

/** Every quarter-hour of the day as { value, label }. */
export function allTimeOptions(): { value: string; label: string }[] {
  return Array.from({ length: (24 * 60) / TIME_STEP_MINUTES }, (_, i) => {
    const mins = i * TIME_STEP_MINUTES;
    const value = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    return { value, label: formatTimeLabel(value) };
  });
}

/**
 * The times to offer for what has been typed so far.
 *
 * With nothing typed, it returns the slots AROUND the current value rather than
 * the start of the day — the old list opened at midnight regardless, which is
 * what made it unusable. When something is typed, it matches on both the typed
 * digits and the 12-hour label, so "2" offers 02:00 and 14:00 and "230" lands
 * straight on 2:30 PM.
 */
export function timeSuggestions(
  typed: string | null | undefined,
  current: string | null | undefined,
  limit = 8
): { value: string; label: string }[] {
  const all = allTimeOptions();
  const q = (typed ?? "").trim().toLowerCase();

  if (!q) {
    const idx = Math.max(0, all.findIndex((o) => o.value === current));
    // Show the current time first, then what follows it — the common edit is
    // "same morning, a bit later", not "back to midnight".
    const start = Math.max(0, idx - 1);
    return all.slice(start, start + limit);
  }

  const exact = parseTimeInput(q);
  const compact = q.replace(/[:.\s]/g, "");
  const scored = all.filter((o) => {
    const label = o.label.toLowerCase();
    return (
      o.value.startsWith(q) ||
      // digits-only match against the 24-hour value: "1430" → 14:30.
      o.value.replace(":", "").startsWith(compact) ||
      // 12-hour label match, WITH its punctuation. Stripping the colon here made
      // "14" match "1:45 PM" (as "145PM"), which is noise, not a suggestion.
      label.startsWith(q)
    );
  });

  // A fully-typed time always leads, even if it isn't on a quarter hour.
  if (exact && !scored.some((o) => o.value === exact)) {
    return [{ value: exact, label: formatTimeLabel(exact) }, ...scored].slice(0, limit);
  }
  if (exact) {
    return [
      { value: exact, label: formatTimeLabel(exact) },
      ...scored.filter((o) => o.value !== exact),
    ].slice(0, limit);
  }
  return scored.slice(0, limit);
}
