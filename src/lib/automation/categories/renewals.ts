// Document / permit renewal nudges. AUTO mode sends the owner a renewals digest;
// PREPARE mode leaves a per-document Outbox draft.

import type { CategoryDef } from "../runtime";
import { appBaseUrl } from "@/lib/app-url";

export const renewalsCategory: CategoryDef = {
  key: "renewals",
  scheduledToday: () => true, // daily
  async run(ctx, mode) {
    const { listDocuments } = await import("@/lib/documents");
    const { getDocumentRenewalCandidates } = await import("@/lib/automation-suggestions");
    const docs = await listDocuments();
    const candidates = await getDocumentRenewalCandidates(docs);
    let prepared = 0, sent = 0;

    if (mode === "auto") {
      // Company docs have no single recipient → a digest to the owner.
      if (candidates.length > 0) {
        const lines = candidates.slice(0, 30).map((c) => `• ${c.document.title} — ${c.status}`);
        const text = `Documents needing renewal (${candidates.length}):\n\n${lines.join("\n")}\n\nReview in Documents & Compliance.`;
        const r = await ctx.sendToOwner(`Renewals due — ${candidates.length} document${candidates.length === 1 ? "" : "s"}`, text, "automation-renewals", {
          doc: {
            preheader: `${candidates.length} document${candidates.length === 1 ? "" : "s"} expiring or expired.`,
            title: "Documents to renew",
            subtitle: `${candidates.length} need${candidates.length === 1 ? "s" : ""} attention`,
            blocks: [{
              kind: "items",
              label: "Renewals",
              items: candidates.slice(0, 30).map((c) => ({
                pill: { label: c.status, tone: c.status === "Expired" ? "danger" : "warn" },
                title: c.document.title,
              })),
            }],
            cta: { label: "Open Documents", url: `${appBaseUrl()}/documents` },
            footerNote: "You're receiving this because the renewals automation is on. Manage in Settings → Email automation.",
            office: "compliance",
          },
        });
        sent = r.sent; prepared = r.prepared;
      }
    } else {
      const { draftDocumentRenewalAction } = await import("@/app/documents/actions");
      for (const c of candidates) {
        const r = await draftDocumentRenewalAction(c.document.id); // de-duped per doc per day
        if (r.ok && r.created) prepared++;
      }
    }

    return { prepared, sent, skipped: 0 };
  },
};
