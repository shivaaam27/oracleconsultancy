// Generated per-person summary image (Aurora-styled) used as the WhatsApp MediaUrl
// header and the link-preview card. Public but signed (see lib/wa-card.ts) and shows
// only aggregate counts — never task detail. Node runtime: uses node:crypto + postgres.js.
import { ImageResponse } from "next/og";
import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { verifyWaCardToken } from "@/lib/wa-card";
import { appBaseUrl } from "@/lib/app-url";

export const runtime = "nodejs";

const C = {
  ink: "#0f2742", muted: "#5b7794", faint: "#9db0c8",
  canvas: "#f7f9fc", wash: "#eef4ff", border: "#e6ebf2",
  accent: "#1f7aeb", danger: "#c0392b", white: "#ffffff",
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
  const overdue = mine.filter((t) => t.daysToDeadline != null && Number(t.daysToDeadline) < 0).length;

  const logo = `${appBaseUrl()}/icon-512.png`;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.canvas, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", height: 10, background: C.accent }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 64px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={64} height={64} style={{ borderRadius: 16, border: `1px solid ${C.border}` }} alt="" />
            <div style={{ display: "flex", marginLeft: 20, fontSize: 30, color: C.ink, fontWeight: 600 }}>
              Oracle Consultancy
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: C.ink }}>{name}&#39;s tasks</div>
            <div style={{ display: "flex", fontSize: 30, color: C.muted, marginTop: 8 }}>
              A quick reminder of where things stand
            </div>
          </div>

          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 280, height: 180, background: C.white, border: `1px solid ${C.border}`, borderRadius: 28, marginRight: 28 }}>
              <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: C.ink }}>{open}</div>
              <div style={{ display: "flex", fontSize: 28, color: C.muted, marginTop: 4 }}>open items</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 280, height: 180, background: C.white, border: `1px solid ${overdue ? "#f2d8d8" : C.border}`, borderRadius: 28 }}>
              <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: overdue ? C.danger : C.ink }}>{overdue}</div>
              <div style={{ display: "flex", fontSize: 28, color: overdue ? C.danger : C.muted, marginTop: 4 }}>overdue</div>
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 26, color: C.faint }}>
            Open your staff portal to see the detail
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
