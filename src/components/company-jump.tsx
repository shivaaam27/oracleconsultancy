"use client";

import { useRouter } from "next/navigation";
import { FluidSelect, type FluidOption } from "./fluid-select";

/**
 * Company picker for the Task Management filter bar. Selecting a company jumps to
 * that company's page (same as the sidebar) so the experience is unified — no
 * more "Tasks" header when you really wanted the company view. "All Companies"
 * returns to the global task list.
 */
export function CompanyJump({
  value,
  companies,
}: {
  /** Currently-selected company id as a string, or "" for all. */
  value: string;
  companies: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const options: FluidOption[] = [
    { value: "", label: "All Companies" },
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  function onSelect(next: string) {
    if (next) router.push(`/companies/${next}`);
    else router.push("/?tab=tasks");
  }

  return <FluidSelect value={value} options={options} onSelect={onSelect} placeholder="All Companies" />;
}
