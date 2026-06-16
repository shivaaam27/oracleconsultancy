// Server-only sender for the Director Brief "send to me now" path. Kept separate
// from director-brief.ts because that file is imported by a client component
// (brief-draft-button.tsx) and must stay free of server-only deps (email/send, sb).
// Shared by Settings (sendDirectorBriefNow) and the home cockpit (sendBriefNowAction).

import { sb } from "@/db/supabase";
import { getBrief, briefEmail, briefEmailDoc } from "@/lib/director-brief";
import { getEmailConfig } from "@/lib/settings";

/** Email the monthly Director Brief to the owner right now (ignores the schedule).
 *  Falls back to an Outbox draft when no email provider is wired. */
export async function sendDirectorBriefToOwnerNow(): Promise<{ sent: boolean }> {
  const cfg = await getEmailConfig();
  const data = await getBrief(new Date(), "month", null);
  const email = briefEmail(data);

  if (cfg?.fromAddress) {
    const { sendEmail } = await import("@/lib/email/send");
    const { renderEmail, senderName } = await import("@/lib/email/layout");
    const html = renderEmail(briefEmailDoc(data));
    const res = await sendEmail({ to: cfg.fromAddress, subject: email.subject, text: email.body, html, fromName: senderName("admin") });
    await sb.from("outbox").insert({
      channel: "EMAIL", recipient_name: cfg.fromName || "Owner", recipient_contact: cfg.fromAddress,
      subject: email.subject, body: email.body, message_type: "DIRECTOR BRIEF",
      status: res.ok ? "Sent" : "Draft", source: "brief-now", created_at: new Date().toISOString(),
    });
    return { sent: res.ok };
  }

  await sb.from("outbox").insert({
    channel: "EMAIL", recipient_name: "Owner", recipient_contact: null,
    subject: email.subject, body: email.body, message_type: "DIRECTOR BRIEF",
    status: "Draft", source: "brief-now", created_at: new Date().toISOString(),
  });
  return { sent: false };
}
