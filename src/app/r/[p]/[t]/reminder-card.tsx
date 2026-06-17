"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import type { WaSummary } from "@/lib/wa-summary";

// Light-mode Aurora reminder card. Server-rendered with `initial` for an instant,
// no-JS paint, then this component keeps it CURRENT: it re-fetches the signed
// /api/wa-card/data feed when the tab becomes visible/focused and on a gentle
// 60s pulse WHILE visible (paused in the background). Fills the viewport with no
// scrolling — the overdue list is capped to what fits the screen height.

const C = {
  pageBg: "#eef2f7",
  card: "#ffffff", cardLine: "#e7eaf1",
  ink: "#141821", soft: "#5b6472", faint: "#9aa1b0",
  accent: "#1f7aeb", accentInk: "#2f6ec0", accentTile: "#f1f6fd", accentTileLine: "#e0ecfb",
  danger: "#e0473f", dangerInk: "#b23028", dangerText: "#c33b32",
  dangerTile: "#fdeeec", dangerTileLine: "#f7d6d2", dangerChip: "#fceae8", dangerChipInk: "#a32d2d",
  rowBg: "#fbfcfe", rowLine: "#ebeef3",
  noticeBg: "#f5f8fc", noticeLine: "#e3eaf4", noticeIcon: "#e9f1fe", noticeIconInk: "#1f6fd6",
  live: "#21c25a", liveBg: "#eef6ef", liveLine: "#d6ead9", liveInk: "#2c7a47",
};

function rowsForHeight(h: number): number {
  if (h >= 820) return 4;
  if (h >= 680) return 3;
  if (h >= 580) return 2;
  return 1;
}

const lateLabel = (d: number) => (d === 0 ? "due today" : `${d} day${d === 1 ? "" : "s"} late`);

export function ReminderCard({
  initial,
  personId,
  sig,
  from,
  portalUrl,
  logoUrl,
}: {
  initial: WaSummary;
  personId: number;
  sig: string;
  from?: string;
  portalUrl: string;
  logoUrl: string;
}) {
  const [data, setData] = useState<WaSummary>(initial);
  const [maxRows, setMaxRows] = useState(3);
  const [updated, setUpdated] = useState(false);
  const lastSnap = useRef(JSON.stringify(initial));
  const updTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cap the visible overdue rows to the screen height (no scrolling, any device).
  useEffect(() => {
    const apply = () => setMaxRows(rowsForHeight(window.innerHeight));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const refresh = useCallback(async () => {
    if (personId <= 0) return;
    try {
      const res = await fetch(`/api/wa-card/data?p=${personId}&t=${encodeURIComponent(sig)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const next = (await res.json()) as WaSummary;
      const snap = JSON.stringify(next);
      setData(next);
      if (snap !== lastSnap.current) {
        lastSnap.current = snap;
        setUpdated(true);
        if (updTimer.current) clearTimeout(updTimer.current);
        updTimer.current = setTimeout(() => setUpdated(false), 2200);
      }
    } catch {
      /* offline / transient — keep showing the last good data */
    }
  }, [personId, sig]);

  // Refresh on return-to-tab + a gentle pulse while visible (paused in background).
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const startPulse = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") refresh();
      }, 60_000);
    };
    const stopPulse = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
        startPulse();
      } else {
        stopPulse();
      }
    };
    if (document.visibilityState === "visible") startPulse();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      stopPulse();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      if (updTimer.current) clearTimeout(updTimer.current);
    };
  }, [refresh]);

  const overduePct = data.open > 0 ? Math.round((data.overdue / data.open) * 100) : 0;
  const shown = data.top.slice(0, maxRows);
  const moreOpen = data.open - shown.length;
  const notice = data.notices[0] ?? null;
  const moreNotices = data.notices.length - (notice ? 1 : 0);
  const moreBits = [
    moreOpen > 0 ? `${moreOpen} more open` : null,
    moreNotices > 0 ? `${moreNotices} more notice${moreNotices === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.pageBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "clamp(10px, 3.5vw, 22px)",
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
        color: C.ink,
      }}
    >
      <style>{`@keyframes waPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      <div
        style={{
          width: "100%",
          maxWidth: 430,
          background: C.card,
          border: `1px solid ${C.cardLine}`,
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 14px 34px -16px rgba(16,24,40,.22)",
        }}
      >
        <div style={{ height: 5, background: C.accent }} />
        <div style={{ padding: "clamp(14px,4.5vw,20px) clamp(14px,4.5vw,19px)", display: "flex", flexDirection: "column", gap: "clamp(11px,3vw,16px)" }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} width={38} height={38} style={{ borderRadius: 11, flex: "0 0 auto" }} alt="" />
              <div style={{ lineHeight: 1.3, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>Oracle Consultancy</div>
                <div style={{ fontSize: 11.5, color: C.soft }}>Staff portal · your tasks</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.liveBg, border: `1px solid ${C.liveLine}`, borderRadius: 999, padding: "4px 10px", flex: "0 0 auto" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: C.live, display: "inline-block", animation: "waPulse 2.4s ease-in-out infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: C.liveInk }}>{updated ? "Updated" : "Live"}</span>
            </div>
          </div>

          {/* Greeting + who it's from */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: "clamp(17px,5.2vw,20px)", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: 1.25 }}>
              {personId > 0 ? `Hi ${data.first} — here's where things stand` : "Open your staff portal"}
            </div>
            {from && <div style={{ fontSize: 12.5, color: C.soft }}>From {from}</div>}
          </div>

          {personId > 0 ? (
            <>
              {/* Stat tiles */}
              <div style={{ display: "flex", gap: 11 }}>
                <div style={{ flex: 1, background: C.accentTile, border: `1px solid ${C.accentTileLine}`, borderRadius: 16, padding: "clamp(11px,3.4vw,14px) clamp(13px,4vw,16px)" }}>
                  <div style={{ fontSize: "clamp(28px,9vw,34px)", fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{data.open}</div>
                  <div style={{ fontSize: 12.5, color: C.accentInk, marginTop: 6, fontWeight: 500 }}>open task{data.open === 1 ? "" : "s"}</div>
                </div>
                <div style={{ flex: 1, background: data.overdue ? C.dangerTile : C.accentTile, border: `1px solid ${data.overdue ? C.dangerTileLine : C.accentTileLine}`, borderRadius: 16, padding: "clamp(11px,3.4vw,14px) clamp(13px,4vw,16px)" }}>
                  <div style={{ fontSize: "clamp(28px,9vw,34px)", fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: data.overdue ? C.dangerInk : C.ink }}>{data.overdue}</div>
                  <div style={{ fontSize: 12.5, color: data.overdue ? C.dangerText : C.soft, marginTop: 6, fontWeight: 500 }}>
                    {data.overdue ? `overdue · ${overduePct}% of open` : "overdue"}
                  </div>
                </div>
              </div>

              {/* Personal announcement */}
              {notice && (
                <div style={{ display: "flex", gap: 11, alignItems: "flex-start", background: C.noticeBg, border: `1px solid ${C.noticeLine}`, borderRadius: 14, padding: "11px 12px" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: C.noticeIcon, color: C.noticeIconInk, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }} aria-hidden>
                    <Megaphone size={17} strokeWidth={2} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.6px", color: C.faint, textTransform: "uppercase" }}>
                        Notice · {notice.source}
                      </span>
                      {notice.unread && <span style={{ width: 6, height: 6, borderRadius: 999, background: C.accent, display: "inline-block" }} />}
                    </div>
                    <div style={{ fontSize: 13.5, color: "#222732", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {notice.title}
                    </div>
                  </div>
                </div>
              )}

              {/* Top overdue */}
              {shown.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", color: C.dangerText, marginBottom: 9 }}>TOP OVERDUE</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {shown.map((t, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: C.rowBg, border: `1px solid ${C.rowLine}`, borderRadius: 13, padding: "10px 13px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <span style={{ width: 7, height: 7, borderRadius: 999, background: C.danger, flex: "0 0 auto" }} />
                          <span style={{ fontSize: 13.5, color: "#222732", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: C.dangerChipInk, background: C.dangerChip, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{lateLabel(t.daysLate)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {moreBits.length > 0 && (
                <div style={{ textAlign: "center", fontSize: 11.5, color: C.faint, marginTop: -4 }}>+ {moreBits.join(" · ")}</div>
              )}

              {shown.length === 0 && !notice && (
                <div style={{ fontSize: 14, color: C.soft }}>You&#39;re all caught up. 🎉</div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 14, color: C.soft }}>Sign in to see your tasks, leave and updates.</div>
          )}

          {/* CTA */}
          <a
            href={portalUrl}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 15, borderRadius: 14, padding: "clamp(12px,3.8vw,15px) 16px", boxShadow: "0 10px 22px -10px rgba(31,122,235,.55)" }}
          >
            Open your tasks <span aria-hidden>→</span>
          </a>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: C.faint, marginTop: 12 }}>
        Oracle Consultancy Limited · staff portal
      </div>
    </div>
  );
}
