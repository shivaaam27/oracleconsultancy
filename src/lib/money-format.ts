// Currency formatting for the project screens (Phase 7). Client-safe.
//
// ⚠️ There is NO conversion anywhere in this file, on purpose. A project is
// priced, invoiced and paid in ONE currency (the owner's decision, Aug 2026).
// An exchange rate would be a number nobody typed quietly changing what every
// figure on the page means, and the workbook has no notion of one.

/** The currencies a project can be priced in. Tanzania first — it is the default. */
export const CURRENCIES = [
  { code: "TZS", symbol: "TSh", label: "Tanzanian shilling" },
  { code: "USD", symbol: "$", label: "US dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "Pound sterling" },
  { code: "AED", symbol: "AED", label: "UAE dirham" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function currencySymbol(code: string | null | undefined): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code ?? "";
}

export function currencyLabel(code: string | null | undefined): string {
  const c = CURRENCIES.find((x) => x.code === code);
  return c ? `${c.symbol} · ${c.label}` : (code ?? "—");
}

/**
 * Money for display: "TSh 165,899,292".
 *
 * Whole units by default — the contract is 195 million and the workbook's own
 * pennies are never read. Returns null (not "0") when there is no value, so the
 * screens can keep showing "—" for "not entered" rather than a fictional zero.
 */
export function fmtMoney(
  v: number | null | undefined,
  currency?: string | null,
  opts: { decimals?: number; symbol?: boolean } = {},
): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const n = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(v);
  if (opts.symbol === false || !currency) return n;
  return `${currencySymbol(currency)} ${n}`;
}
