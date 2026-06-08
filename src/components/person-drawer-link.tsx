"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Props = {
  id: number;
  name: string;
  className?: string;
  /** Render this instead of the name (e.g. an icon button). */
  children?: ReactNode;
  title?: string;
  "aria-label"?: string;
};

/**
 * Pushes ?person=<id> into the URL (no page navigation) so PersonDrawer picks
 * it up. Also clears any ?task= so the task drawer closes when a person opens.
 */
export function PersonDrawerLink({ id, name, className, children, title, ...rest }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const open = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("person", String(id));
    params.delete("task"); // one drawer at a time
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <button
      type="button"
      onClick={open}
      className={className}
      title={title}
      aria-label={rest["aria-label"] ?? (children ? name : undefined)}
    >
      {children ?? name}
    </button>
  );
}
