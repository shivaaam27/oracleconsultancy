"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Print-hidden picker that chooses which company brands the Staff Data
 * Collection Form (`/people/form`). Selecting a company sets `?company=<id>`
 * (the header + Employment "Company" box then show that company instead of the
 * parent Oracle brand). The current person/deadline/missing params are kept.
 * "Generic (Oracle)" clears the override.
 */
export function FormCompanyPicker({
  companies,
  selected,
}: {
  companies: { id: number; name: string }[];
  selected: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) params.set("company", e.target.value);
    else params.delete("company");
    router.push(`/people/form?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-1.5 text-sm text-fg-muted">
      <span className="whitespace-nowrap">Form for</span>
      <select
        value={selected ?? ""}
        onChange={onChange}
        className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
      >
        <option value="">Generic (Oracle)</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
