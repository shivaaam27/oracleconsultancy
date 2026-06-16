// Monthly board-pack reminder (1st of the month, EAT). The board pack concentrates
// the most sensitive data (passports, salaries, governance), so this is a NUDGE to
// the owner — with the PDF attached when it renders — to forward to the director +
// CFO, not an automated PII email to them directly.

import type { CategoryDef } from "../runtime";
import { eatDayOfMonth } from "../runtime";
import { recordEvent } from "@/lib/system-events";
import { appBaseUrl } from "@/lib/app-url";

export const boardPackCategory: CategoryDef = {
  key: "boardPack",
  scheduledToday: (_cfg, now) => eatDayOfMonth(now) === 1,
  async run(ctx) {
    const now = ctx.now;
    // Render the PDF server-side (no headless browser). If it fails, still send
    // the link nudge so the run isn't lost.
    let attachments: Array<{ filename: string; content: string; contentType?: string; encoding: "base64" }> | undefined;
    try {
      const { renderBoardPackPdf } = await import("@/lib/board-pack-pdf");
      const buf = await renderBoardPackPdf(now);
      const stamp = now.toISOString().slice(0, 10);
      attachments = [{ filename: `Board-Pack-${stamp}.pdf`, content: buf.toString("base64"), contentType: "application/pdf", encoding: "base64" }];
    } catch (e) {
      await recordEvent("email.automation.boardPack", "error", { message: "pdf-render-failed", detail: e instanceof Error ? e.message : String(e) });
    }

    const text = [
      attachments ? `The monthly board pack PDF is attached (open it online if your client strips it).` : `The monthly board pack is ready — open it online (PDF not attached).`,
      ``,
      `It covers compliance, finance, the risk register, governance (cap table / UBO / signatories), immigration and the safety-net appendix.`,
      `Most sensitive artifact — for the director + CFO only.`,
      ``,
      `View online: ${appBaseUrl()}/brief/board`,
    ].join("\n");
    const r = await ctx.sendToOwner("Board pack — monthly", text, "automation-boardpack", {
      attachments,
      doc: {
        preheader: "The monthly board pack is ready — for the director & CFO.",
        title: "Board pack",
        subtitle: "Monthly · confidential",
        blocks: [{
          kind: "text",
          text: `${attachments ? "The board pack PDF is attached (open it online if your client strips it)." : "The board pack is ready — open it online (PDF not attached)."}\n\nIt covers compliance, finance, the risk register, governance (cap table / UBO / signatories), immigration and the safety-net appendix. Most sensitive artifact — for the director & CFO only.`,
        }],
        cta: { label: "View the board pack", url: `${appBaseUrl()}/brief/board` },
        footerNote: "You're receiving this because the monthly board-pack automation is on. Manage in Settings → Email automation.",
        office: "admin",
      },
    });
    return { prepared: r.prepared, sent: r.sent, skipped: 0 };
  },
};
