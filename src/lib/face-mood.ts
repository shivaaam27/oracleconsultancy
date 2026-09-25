/**
 * Each person's face (Blobatar, Sept 2026 — owner: "give each user their avatar
 * based on their role… the avatar reacts to" their work). Pure and client-safe:
 * the server counts, this decides; the tests hold the rules still.
 *
 * Colour = role. Expression = the loudest thing about their work right now,
 * in this order: overburdened → badly late → in a meeting → a little late →
 * due soon → finishing lots → nothing open → getting on with it.
 */

export type FaceRole = "owner" | "director" | "manager" | "hr" | "staff" | "none";
export type FaceMood = "idle" | "happy" | "sad" | "surprised" | "sleepy" | "unsure" | "love" | "sick" | "thinking";

export type FaceStats = {
  open: number;
  overdue: number;
  dueSoon: number;
  inProgress: number;
  doneThisMonth: number;
  inMeeting: boolean;
};

/** One hue per role (degrees). No portal = no colour of its own. */
export const ROLE_HUE: Record<FaceRole, number> = {
  owner: 212,    // blue
  director: 40,  // gold
  manager: 265,  // violet
  hr: 330,       // pink
  staff: 165,    // teal
  none: 30,
};

/** How loud a workload has to be before the face shows it. */
export const OVERBURDENED_OPEN = 12;
export const OVERBURDENED_LATE = 3;

export function moodFor(s: FaceStats): FaceMood {
  if (s.open >= OVERBURDENED_OPEN && s.overdue >= OVERBURDENED_LATE) return "sick";
  if (s.overdue >= 3) return "sad";
  if (s.inMeeting) return "thinking";
  if (s.overdue > 0) return "unsure";
  if (s.dueSoon > 0) return "surprised";
  if (s.doneThisMonth >= 10) return "love";
  if (s.doneThisMonth >= 3) return "happy";
  if (s.open === 0) return "sleepy";
  return "idle";
}

/** What the face means, in words — its tooltip. */
export const MOOD_WORDS: Record<FaceMood, string> = {
  sick: "Overburdened — a lot open and several late",
  sad: "Several tasks are late",
  thinking: "In a meeting now",
  unsure: "A task is late",
  surprised: "Something is due soon",
  love: "Finishing a lot this month",
  happy: "Getting things done",
  sleepy: "Nothing open",
  idle: "Getting on with it",
};

/** The key a face is looked up by: a name as it appears on a task. */
export function faceKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}
