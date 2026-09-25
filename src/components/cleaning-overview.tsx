import type { DayStatus } from "@/lib/cleaning-shared";

/** One day in the cleaning history — what the Studio cleaning page lists for
 *  oversight roles. (The old read-only overview that drew it is gone.) */
export type CleaningHistoryRow = { date: Date; status: DayStatus; cleanerName: string | null; done: number; total: number };
