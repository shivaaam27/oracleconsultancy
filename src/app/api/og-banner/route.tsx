// The 1200x630 picture WhatsApp (and any chat) shows when an Oracle link is
// shared — landscape, because a square image collapses to a tiny thumbnail.
// Public, no auth, no DB.
//
// Studio look (owner, 26 Sept 2026): the Home card's dark tile, "Task
// Management", and one square per task — the same mark as the app icon. The
// squares are a FIXED pattern, never live numbers: this picture is public to
// anyone a link is sent to.
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const INK = "#141517";
const BAND = { q: "#CFE05A", m: "#19C37D", s: "#F5A524", l: "#E0479E" } as const;
// The app icon's pattern: 5 across, 4 rows, the last row three long — quiet,
// moving, due soon, late.
const SQUARES: (keyof typeof BAND)[] = [
  ...Array<keyof typeof BAND>(2).fill("q"),
  ...Array<keyof typeof BAND>(9).fill("m"),
  ...Array<keyof typeof BAND>(2).fill("s"),
  ...Array<keyof typeof BAND>(5).fill("l"),
];
const CELL = 66;
const GAP = 13;

export function GET() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: INK, padding: "0 84px", alignItems: "center", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 26, color: "#9A9CA1", letterSpacing: 0.5 }}>Oracle Consultancy</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 18, fontSize: 104, lineHeight: 1, color: "#F2F2F0", letterSpacing: -4, fontWeight: 500 }}>
            <span>Task</span>
            <span>Management</span>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 25, color: "#C9CBCF" }}>One place for every task, across every company.</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: CELL * 5 + GAP * 4, gap: GAP, marginLeft: 40 }}>
          {SQUARES.map((k, i) => (
            <div key={i} style={{ display: "flex", width: CELL, height: CELL, borderRadius: 15, background: BAND[k] }} />
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
