// Compensation + final-pay helpers, grounded in the Tanzanian Employment and
// Labour Relations Act 2004. Estimates only — surfaced with a disclaimer; the
// owner confirms actual figures with the accountant. Currency is TZS.
//
// Rules used:
//  - Daily wage from a monthly wage uses the ELR convention of /26 working days.
//  - Severance pay (s.42): at least 7 days' basic wage per completed year of
//    continuous service (capped here at 10 years, the statutory minimum basis).
//  - Notice (s.41): 28 days for monthly-paid employees; pay-in-lieu = 28 days' wage.
//  - Accrued annual leave: remaining annual-leave days paid at the daily wage.

export type WageBasis = "monthly" | "daily" | "hourly";

export const WAGE_BASIS_LABEL: Record<WageBasis, string> = {
  monthly: "per month",
  daily: "per day",
  hourly: "per hour",
};

/** Daily basic wage from the stored amount + basis (TZS). */
export function dailyWage(amount: number, basis: WageBasis | string | null): number {
  if (!amount || amount <= 0) return 0;
  switch (basis) {
    case "daily":
      return amount;
    case "hourly":
      return amount * 8; // an 8-hour working day
    case "monthly":
    default:
      return amount / 26; // ELR convention: 26 working days a month
  }
}

/** Whole completed years of continuous service from a start date. */
export function completedYears(startDate: Date | null, asOf: Date = new Date()): number {
  if (!startDate) return 0;
  let years = asOf.getUTCFullYear() - startDate.getUTCFullYear();
  const anniv = new Date(Date.UTC(asOf.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  if (asOf < anniv) years--;
  return Math.max(0, years);
}

export type FinalPayInput = {
  wageAmount: number | null;
  wageBasis: WageBasis | string | null;
  startDate: Date | null;
  /** Remaining (untaken) annual-leave days to pay out. */
  annualLeaveRemaining?: number | null;
  /** Pay 28 days' notice in lieu (summary dismissal / immediate exit). */
  noticeInLieu?: boolean;
  asOf?: Date;
};

export type FinalPayEstimate = {
  hasWage: boolean;
  dailyWage: number;
  years: number;
  severance: number;
  noticeInLieu: number;
  leavePayout: number;
  total: number;
};

const SEVERANCE_DAYS_PER_YEAR = 7;
const SEVERANCE_MAX_YEARS = 10; // statutory minimum basis cap
const NOTICE_DAYS = 28;

/** Estimate a leaver's final pay (severance + notice-in-lieu + accrued leave). */
export function estimateFinalPay(input: FinalPayInput): FinalPayEstimate {
  const amount = input.wageAmount ?? 0;
  const daily = dailyWage(amount, input.wageBasis ?? "monthly");
  const years = Math.min(completedYears(input.startDate, input.asOf), SEVERANCE_MAX_YEARS);
  const severance = Math.round(daily * SEVERANCE_DAYS_PER_YEAR * years);
  const notice = input.noticeInLieu ? Math.round(daily * NOTICE_DAYS) : 0;
  const leavePayout = Math.round(daily * Math.max(0, input.annualLeaveRemaining ?? 0));
  return {
    hasWage: amount > 0,
    dailyWage: Math.round(daily),
    years: completedYears(input.startDate, input.asOf),
    severance,
    noticeInLieu: notice,
    leavePayout,
    total: severance + notice + leavePayout,
  };
}
