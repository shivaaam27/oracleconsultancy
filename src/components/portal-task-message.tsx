"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";
import { portalOpenDm } from "@/app/portal/actions";
import { useToast } from "@/components/toast";
import { getGivenName } from "@/lib/names";
import { cn } from "@/lib/cn";

/** A small "Message a teammate" row on the portal task page: one glass chip per
 *  teammate (the viewer is already filtered out by the page). Tapping opens — or
 *  continues — a direct chat with that person and jumps into it. Chat is
 *  everyone↔everyone, so this is offered to every role; portalOpenDm itself
 *  re-verifies the session and that the target is a real person. */
export function PortalTaskMessage({ people }: { people: { id: number; name: string }[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [, start] = useTransition();

  if (people.length === 0) return null;

  const open = (personId: number) => {
    setPending(personId);
    start(async () => {
      const res = await portalOpenDm(personId);
      if (!res.ok) {
        toast(res.error, { tone: "danger" });
        setPending(null);
        return;
      }
      router.push(`/portal/chat/${res.threadId}`);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {people.map((p) => {
        const first = getGivenName(p.name) || p.name;
        const busy = pending === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => open(p.id)}
            disabled={pending != null}
            title={`Message ${first}`}
            aria-label={`Message ${first}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1.5 text-sm text-fg-muted ring-1 ring-border transition-all",
              "hover:text-accent hover:ring-accent/40 active:scale-95 disabled:opacity-50",
            )}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
            {first}
          </button>
        );
      })}
    </div>
  );
}
