"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/** Pushes ?company=<id> so CompanyDrawer opens (no page navigation). */
export function CompanyDrawerLink({
  id, className, children, title,
}: {
  id: number;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const open = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("company", String(id));
    params.delete("task");
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
  return (
    <button type="button" onClick={open} className={className} title={title}>
      {children}
    </button>
  );
}
