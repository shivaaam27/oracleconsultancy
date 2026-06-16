"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "./ui";
import {
  isRequestOpen,
  partiesLabel,
  requestStatusLabel,
  requestStatusTone,
  type RequestRow,
} from "@/lib/requests-shared";

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type Tab = "to_me" | "raised" | "all";

/** Shared request list. Portal passes meId (enables To-me / I-raised tabs);
 *  the owner inbox passes scope="admin" (status filter + "awaiting you"). */
export function RequestList({
  rows,
  base,
  meId,
  scope = "portal",
}: {
  rows: RequestRow[];
  base: string;
  meId?: number;
  scope?: "portal" | "admin";
}) {
  const [tab, setTab] = useState<Tab>(scope === "admin" ? "all" : "to_me");
  const [openOnly, setOpenOnly] = useState(false);
  const [q, setQ] = useState("");

  const isToMe = (r: RequestRow) =>
    scope === "admin" ? r.recipients.some((p) => p.isOwner) : r.recipients.some((p) => p.id === meId);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "to_me" && !isToMe(r)) return false;
      if (tab === "raised" && r.requesterId !== meId) return false;
      if (openOnly && !isRequestOpen(r.status)) return false;
      if (query) {
        const hay = `${r.code} ${r.title} ${r.requesterName} ${r.recipients.map((p) => p.name).join(" ")} ${r.category ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, tab, openOnly, scope, meId]);

  const toMeOpen = useMemo(() => rows.filter((r) => isToMe(r) && isRequestOpen(r.status)).length, [rows, scope, meId]);

  const tabs: { id: Tab; label: string; badge?: number }[] =
    scope === "admin"
      ? [
          { id: "all", label: "All" },
          { id: "to_me", label: "Awaiting you", badge: toMeOpen },
        ]
      : [
          { id: "to_me", label: "Addressed to me", badge: toMeOpen },
          { id: "raised", label: "I raised" },
          { id: "all", label: "All" },
        ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
              tab === t.id ? "bg-accent-soft text-accent ring-accent/30" : "text-fg-muted ring-border hover:bg-bg-muted"
            )}
          >
            {t.label}
            {t.badge ? (
              <span className="inline-flex min-w-[16px] justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpenOnly((v) => !v)}
          className={cn(
            "ml-auto rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
            openOnly ? "bg-accent-soft text-accent ring-accent/30" : "text-fg-muted ring-border hover:bg-bg-muted"
          )}
        >
          Open only
        </button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search requests…"
        className="w-full rounded-md bg-bg-elev text-sm ring-1 ring-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
      />

      <div className="overflow-hidden rounded-2xl bg-bg-elev ring-1 ring-border">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">No requests here yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((r) => {
              const unseen = scope === "admin" && r.recipients.some((p) => p.isOwner) && !r.seen && isRequestOpen(r.status);
              const fromLabel = r.requesterIsOwner ? "Oracle Consultancy" : r.requesterName;
              return (
                <Link
                  key={r.id}
                  href={`${base}/${r.id}`}
                  className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-bg-muted/50 transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {unseen && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" />}
                      <span className="truncate text-sm font-medium">{r.title}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">
                      {r.code} · {r.category ?? "Request"} · {fromLabel} → {partiesLabel(r.recipients, scope === "admin")}
                      {r.companyName ? ` · ${r.companyName}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={requestStatusTone(r.status)}>{requestStatusLabel(r.status)}</Badge>
                    <span className="text-[10px] text-fg-subtle">{ago(r.updatedAt)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
