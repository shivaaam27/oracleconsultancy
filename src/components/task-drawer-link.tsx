"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Props = {
  code: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Pushes ?task=CODE into the URL (no page navigation) so the TaskDrawer
 * picks it up via useSearchParams. The full /task/[code] page is unchanged
 * and still reachable via the "Full page" button inside the drawer.
 */
export function TaskDrawerLink({ code, children, className }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const open = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <button type="button" onClick={open} className={className}>
      {children}
    </button>
  );
}
