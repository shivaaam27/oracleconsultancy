// Generated per-person summary image (light-Aurora) used as the WhatsApp
// link-preview card (and the Twilio MediaUrl header). Public but signed (see
// lib/wa-card.ts). Shows aggregate counts plus the recipient's top-3 overdue task
// titles — the recipient already owns these, and the URL is HMAC-signed so it
// can't be enumerated. Node runtime: uses node:crypto + postgres.js.
import { ImageResponse } from "next/og";
import { verifyWaCardToken, sanitizeFrom } from "@/lib/wa-card";
import { loadWaSummary } from "@/lib/wa-summary";
import { appBaseUrl } from "@/lib/app-url";

export const runtime = "nodejs";

// Light-mode Aurora — white surfaces, one cool-blue accent (mirrors the landing card).
const C = {
  bg: "#ffffff", panel: "#f8fafd", line: "#e7eaf1",
  ink: "#141821", soft: "#5b6472", faint: "#8b93a3",
  accent: "#1f7aeb", accentInk: "#2f6ec0", accentPanel: "#f1f6fd", accentLine: "#e0ecfb",
  danger: "#d83a34", dangerInk: "#b23028", dangerPanel: "#fdeeec", dangerLine: "#f7d6d2",
  live: "#21c25a", liveBg: "#eef6ef", liveLine: "#d6ead9", liveInk: "#2c7a47",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const personId = Number(url.searchParams.get("p"));
  const sig = url.searchParams.get("t") ?? "";
  // personId 0 is the valid "sample" card (used by the Settings test send).
  if (!Number.isInteger(personId) || personId < 0 || !verifyWaCardToken(personId, sig)) {
    return new Response("Not found", { status: 404 });
  }

  const s = await loadWaSummary(personId, false); // counts + overdue; no announcement query
  const name = personId > 0 ? s.first : "You";
  const open = s.open;
  const overdue = s.overdue;
  const top3 = s.top.slice(0, 3);
  const from = sanitizeFrom(url.searchParams.get("from"));

  const logo = `${appBaseUrl()}/icon-512.png`;
  const clamp = (str: string, n: number) => (str.length > n ? `${str.slice(0, n - 1).trimEnd()}…` : str);
  const lateLabel = (d: number) => (d === 0 ? "due today" : `${d} day${d === 1 ? "" : "s"} late`);

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
            <div style={{ display: "flex", alignItems: "center", background: C.liveBg, border: `1px solid ${C.liveLine}`, borderRadius: 999, padding: "10px 20px" }}>
              <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: C.live, marginRight: 10 }} />
              <div style={{ display: "flex", fontSize: 20, color: C.liveInk }}>Updated live</div>
            </div>
          </div>

          {/* Greeting + who it's from */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 26, color: C.soft, letterSpacing: 1 }}>
              {`Hi ${name} — here’s where things stand`}
            </div>
            {from && (
              <div style={{ display: "flex", fontSize: 22, color: C.faint, marginTop: 8 }}>
                From {from}
              </div>
            )}
          </div>

          {/* Counts + top-3 overdue */}
          <div style={{ display: "flex" }}>
            {/* Left: two stat tiles */}
            <div style={{ display: "flex", flexDirection: "column", marginRight: 36 }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 300, height: 150, background: C.accentPanel, border: `1px solid ${C.accentLine}`, borderRadius: 26, padding: "0 32px", marginBottom: 20 }}>
                <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: C.ink }}>{open}</div>
                <div style={{ display: "flex", fontSize: 24, color: C.accentInk }}>open tasks</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 300, height: 150, background: overdue ? C.dangerPanel : C.accentPanel, border: `1px solid ${overdue ? C.dangerLine : C.accentLine}`, borderRadius: 26, padding: "0 32px" }}>
                <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: overdue ? C.dangerInk : C.ink }}>{overdue}</div>
                <div style={{ display: "flex", fontSize: 24, color: overdue ? C.danger : C.soft }}>overdue</div>
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
                    <div style={{ display: "flex", fontSize: 24, color: C.ink }}>{clamp(t.title, 30)}</div>
                  </div>
                  <div style={{ display: "flex", fontSize: 20, color: C.danger, whiteSpace: "nowrap" }}>{lateLabel(t.daysLate)}</div>
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
