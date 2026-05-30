"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FluidSelect, type FluidOption } from "./fluid-select";

/**
 * A FluidSelect wired to a URL search param. Picking an option updates that one
 * param (preserving every other filter) and navigates — the instant-apply feel
 * of the old native filters, but as a fluid glass popover.
 */
export function FilterSelect({
  param,
  value,
  options,
  placeholder,
  align,
}: {
  param: string;
  value: string;
  options: FluidOption[];
  placeholder?: string;
  align?: "left" | "right";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onSelect(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(param, next);
    else params.delete(param);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <FluidSelect
      value={value}
      options={options}
      onSelect={onSelect}
      placeholder={placeholder}
      align={align}
    />
  );
}
