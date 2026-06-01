"use client";

import { useRouter } from "next/navigation";
import { ModalShell } from "./modal-shell";

/**
 * A route-driven modal for intercepting routes: the page underneath stays
 * mounted (parallel @modal slot), so opening this feels like an overlay rather
 * than a navigation. Closing pops the history entry (router.back), revealing the
 * originating section exactly as it was. Presentation is the shared ModalShell.
 */
export function RouteModal({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <ModalShell open onClose={() => router.back()} title={title} subtitle={subtitle} ariaLabel={title} maxWidthClass="sm:max-w-2xl">
      {children}
    </ModalShell>
  );
}
