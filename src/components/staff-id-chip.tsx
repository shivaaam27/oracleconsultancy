import { cn } from "@/lib/cn";

/** A small monospace chip showing a person's system-wide staff ID
 *  (e.g. CZ-E04). Renders nothing when the person has no ID. */
export function StaffIdChip({ id, className }: { id: string | null | undefined; className?: string }) {
  if (!id) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-bg-subtle ring-1 ring-border px-1.5 py-0.5 text-[10px] font-medium tabular text-fg-muted tracking-wide",
        className
      )}
    >
      {id}
    </span>
  );
}
