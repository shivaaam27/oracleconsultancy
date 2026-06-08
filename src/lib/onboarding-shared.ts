/* Client-safe onboarding/offboarding types + labels. No server imports here,
 * so client components (journey-checklist.tsx) can use them without pulling in
 * the server-only Supabase client. The engine lives in lib/onboarding.ts. */

export type JourneyKind = "onboarding" | "offboarding";

export const JOURNEY_LABELS: Record<JourneyKind, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
};

export type JourneyStep = {
  id: number;
  label: string;
  done: boolean;
  dueAt: string | null;
  sortOrder: number;
};

export type Journey = {
  kind: JourneyKind;
  steps: JourneyStep[];
  total: number;
  completed: number;
  percent: number;
};
