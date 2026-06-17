// Generic 1200x630 landscape OG banner for link-preview cards (WhatsApp shows a
// LARGE card only for ~1.91:1 images — a square logo collapses to a tiny thumbnail).
// Public, no auth, no DB. Aurora-styled to match the email + summary image.
import { ImageResponse } from "next/og";
import { appBaseUrl } from "@/lib/app-url";

export const runtime = "nodejs";

const C = {
  ink: "#0f2742", muted: "#5b7794", faint: "#9db0c8",
  canvas: "#f7f9fc", wash: "#eef4ff", border: "#e6ebf2", accent: "#1f7aeb", white: "#ffffff",
};

export function GET() {
  const logo = `${appBaseUrl()}/icon-512.png`;
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.wash, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: 12, background: C.accent }} />
        <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "0 80px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={150} height={150} style={{ borderRadius: 36, border: `1px solid ${C.border}` }} alt="" />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 44 }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: C.ink }}>Oracle Consultancy</div>
            <div style={{ display: "flex", fontSize: 34, color: C.muted, marginTop: 10 }}>Staff portal — your tasks, leave &amp; updates</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
