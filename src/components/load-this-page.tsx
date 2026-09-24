"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * Leave an intercepted route for the real page at the same address.
 *
 * Next's `(.)task/new` interception shows the old New-task form as a modal
 * on top of whatever page you were on. In Studio the new task is a full page
 * of its own (the draft record), so the modal slot renders this instead: a
 * full load of the address you are already at, which the interception does
 * not catch.
 */
export function LoadThisPage() {
  useEffect(() => { window.location.replace(window.location.href); }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(14,15,16,0.2)]">
      <Loader2 size={20} className="animate-spin text-white" />
    </div>
  );
}
