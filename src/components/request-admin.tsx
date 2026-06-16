"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { RequestComposer } from "./request-composer";
import { RequestList } from "./request-list";
import { RequestTrendsView } from "./request-trends";
import type { RequestRow, RequestRecipient, RequestTrends } from "@/lib/requests-shared";

type RaiseAction = (prev: { error: string } | null, formData: FormData) => Promise<{ error: string } | null>;

/** Owner control-centre Requests: Inbox (raise + list) and Trends tabs. */
export function RequestAdmin({
  rows,
  people,
  trends,
  raiseAction,
}: {
  rows: RequestRow[];
  people: RequestRecipient[];
  trends: RequestTrends;
  raiseAction: RaiseAction;
}) {
  const [tab, setTab] = useState<"inbox" | "trends">("inbox");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        {(["inbox", "trends"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition-colors",
              tab === t ? "bg-accent-soft text-accent ring-accent/30" : "text-fg-muted ring-border hover:bg-bg-muted"
            )}
          >
            {t === "inbox" ? "Inbox" : "Trends"}
          </button>
        ))}
      </div>

      {tab === "inbox" ? (
        <div className="flex flex-col gap-4">
          <RequestComposer recipients={people} action={raiseAction} label="Raise a request" />
          <RequestList rows={rows} base="/requests" scope="admin" />
        </div>
      ) : (
        <RequestTrendsView trends={trends} />
      )}
    </div>
  );
}
