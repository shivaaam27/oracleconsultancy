"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MONEY INPUT — commas as you type, and the currency in front of them.
//
// Every amount box in the project screens used to be a plain text input: you
// typed 165899292 and squinted at it to check the zeros. On nine-digit
// contract values that is a real source of error — 16,589,929 and 165,899,292
// look identical at a glance and differ by a factor of ten.
//
// ── How it behaves ───────────────────────────────────────────────────────────
// · commas appear while you type, and are stripped again on the way out, so
//   the caller always receives a plain number string
// · the caret stays where you left it (naive reformatting throws it to the end
//   after every keystroke, which makes correcting a middle digit impossible)
// · one decimal point is allowed and never reformatted while you are typing it
// · the currency is shown as a prefix, not typed
// ─────────────────────────────────────────────────────────────────────────────

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { currencySymbol } from "@/lib/money-format";

/** "1234567.5" → "1,234,567.5". Leaves a trailing "." alone while typing.
 *
 *  ⚠️ Coerces first. A Postgres `numeric` comes back from PostgREST as a JSON
 *  NUMBER, not a string, and several callers pass it straight through under a
 *  `string` type annotation — which TypeScript believes and the browser does
 *  not. `raw.startsWith is not a function` took the whole edit panel down on
 *  any project that had a price on it. */
export function withCommas(input: string | number): string {
  const raw = input === null || input === undefined ? "" : String(input);
  if (raw === "" || raw === "-") return raw;
  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  const [whole, ...rest] = body.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = rest.length ? "." + rest.join("") : body.endsWith(".") ? "." : "";
  return (neg ? "-" : "") + grouped + tail;
}

/** Anything a person might type → a plain number string the server can store. */
export function stripCommas(v: string | number): string {
  return String(v ?? "").replace(/[^\d.-]/g, "");
}

export function MoneyInput({
  value, onChange, currency, className, placeholder, disabled, inputRef, onKeyDown,
}: {
  /** A plain number string, e.g. "165899292.12". Never formatted.
   *  Accepts a number too, because a `numeric` column arrives as one. */
  value: string | number;
  onChange: (plain: string) => void;
  /** ISO code — TZS, USD. Omit for a bare number (quantities, rates). */
  currency?: string | null;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const ownRef = useRef<HTMLInputElement | null>(null);
  const ref = inputRef ?? ownRef;
  /** Where the caret should sit after React re-renders with the grouped text. */
  const caret = useRef<number | null>(null);

  // ⚠️ Restoring the caret must happen BEFORE the browser paints, or you see it
  // jump to the end and snap back. useLayoutEffect, not useEffect.
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  const display = withCommas(value);
  const symbol = currency ? currencySymbol(currency) : null;

  return (
    <span className="relative block min-w-0">
      {symbol && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-fg-subtle">
          {symbol}
        </span>
      )}
      <input
        ref={ref}
        value={display}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const el = e.target;
          const next = stripCommas(el.value);
          // Count digits to the LEFT of the caret rather than characters —
          // commas shift character positions, digits do not.
          const upto = el.value.slice(0, el.selectionStart ?? 0);
          const digitsBefore = (upto.match(/[\d.-]/g) ?? []).length;
          const regrouped = withCommas(next);
          let pos = 0, seen = 0;
          while (pos < regrouped.length && seen < digitsBefore) {
            if (/[\d.-]/.test(regrouped[pos])) seen += 1;
            pos += 1;
          }
          caret.current = pos;
          onChange(next);
        }}
        className={cn(
          "h-8 w-full rounded-md border border-border bg-bg text-[13px] tabular outline-none placeholder:text-fg-subtle focus:border-accent",
          symbol ? "pl-9 pr-2 text-right" : "px-2 text-right",
          className,
        )}
      />
    </span>
  );
}
