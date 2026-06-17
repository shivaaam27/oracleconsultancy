// Generated per-person summary image (Aurora-styled) used as the WhatsApp MediaUrl
// header and the link-preview card. Public but signed (see lib/wa-card.ts). Shows
// aggregate counts plus the recipient's top-3 overdue task titles — the recipient
// already owns these, and the URL is HMAC-signed so it can't be enumerated.
// Node runtime: uses node:crypto + postgres.js.
import { ImageResponse } from "next/og";
import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { verifyWaCardToken } from "@/lib/wa-card";
import { appBaseUrl } from "@/lib/app-url";

export const runtime = "nodejs";

// Aurora — dark liquid-glass, one cool-blue accent.
const C = {
  bg: "#0a1626", panelHi: "#15324f", panel: "#12263d", line: "#23456a",
  ink: "#eef5ff", soft: "#9cc0e8", faint: "#6f93ba",
  accent: "#4aa3ff", accentInk: "#bfe0ff",
  danger: "#ff7a7a", dangerInk: "#ffd9d9", dangerPanel: "#2a1620",
  live: "#4ade80",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const personId = Number(url.searchParams.get("p"));
  const sig = url.searchParams.get("t") ?? "";
  // personId 0 is the valid "sample" card (used by the Settings test send).
  if (!Number.isInteger(personId) || personId < 0 || !verifyWaCardToken(personId, sig)) {
    return new Response("Not found", { status: 404 });
  }

  const { data: person } = await sb.from("people").select("id,name").eq("id", personId).maybeSingle();
  const name = (person?.name as string | undefined)?.split(" ")[0] ?? "You";

  const mine = (await getAllTasks()).filter(
    (t) => isOpen(t.status) && t.assigneeIds.includes(personId),
  );
  const open = mine.length;
  const overdue = mine.filter((t) => t.daysToDeadline != null && Number(t.daysToDeadline) < 0);
  // Most-overdue first; top 3 by title for the header list.
  const top3 = [...overdue]
    .sort((a, b) => Number(a.daysToDeadline) - Number(b.daysToDeadline))
    .slice(0, 3);

  const logo = `${appBaseUrl()}/icon-512.png`;
  const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const lateLabel = (d: number) => {
    const days = Math.abs(Math.round(d));
    return days === 0 ? "due today" : `${days} day${days === 1 ? "" : "s"} late`;
  };

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.bg, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: 8, background: C.accent }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "52px 60px", justifyContent: "space-between" }}>

          {/* Header — brand + live pill */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} width={60} height={60} style={{ borderRadius: 16 }} alt="" />
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
                <div style={{ display: "flex", fontSize: 30, color: C.ink, fontWeight: 700 }}>Oracle Consultancy</div>
                <div style={{ display: "flex", fontSize: 20, color: C.soft, marginTop: 2 }}>Staff portal · your tasks &amp; reminders</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: "10px 20px" }}>
              <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: C.live, marginRight: 10 }} />
              <div style={{ display: "flex", fontSize: 20, color: C.soft }}>Updated live</div>
            </div>
          </div>

          {/* Greeting */}
          <div style={{ display: "flex", fontSize: 26, color: C.soft, letterSpacing: 1 }}>
            Hi {name} — here&#39;s where things stand
          </div>

          {/* Counts + top-3 overdue */}
          <div style={{ display: "flex" }}>
            {/* Left: two stat tiles */}
            <div style={{ display: "flex", flexDirection: "column", marginRight: 36 }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 300, height: 150, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 26, padding: "0 32px", marginBottom: 20 }}>
                <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: C.ink }}>{open}</div>
                <div style={{ display: "flex", fontSize: 24, color: C.accentInk }}>open tasks</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 300, height: 150, background: overdue.length ? C.dangerPanel : C.panel, border: `1px solid ${overdue.length ? "#5a2a32" : C.line}`, borderRadius: 26, padding: "0 32px" }}>
                <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: overdue.length ? C.dangerInk : C.ink }}>{overdue.length}</div>
                <div style={{ display: "flex", fontSize: 24, color: overdue.length ? C.danger : C.soft }}>overdue</div>
              </div>
            </div>

            {/* Right: top 3 overdue list */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
              <div style={{ display: "flex", fontSize: 20, color: C.danger, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>
                {top3.length ? "TOP OVERDUE" : "NOTHING OVERDUE"}
              </div>
              {top3.length ? top3.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 22px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", flex: 1, marginRight: 16 }}>
                    <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: C.danger, marginRight: 14 }} />
                    <div style={{ display: "flex", fontSize: 24, color: C.ink }}>{clamp(t.actionItem, 30)}</div>
                  </div>
                  <div style={{ display: "flex", fontSize: 20, color: C.danger, whiteSpace: "nowrap" }}>{lateLabel(Number(t.daysToDeadline))}</div>
                </div>
              )) : (
                <div style={{ display: "flex", fontSize: 24, color: C.soft }}>You&#39;re all caught up. 🎉</div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", fontSize: 22, color: C.faint }}>
            Tap to open your live task board →
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
