"use client";
/* "Remind about open work" for one person — the old drawer's handleRemind, in
 * one place so the Studio list and the Studio person page do the same thing.
 * It SAVES A DRAFT in the Outbox (de-duplicated per day) and never sends: a
 * person-to-person message is always the owner's to send. */
import { useTransition } from "react";
import { createPersonPackDraftAction } from "@/app/people/pack-actions";
import { pickChannel } from "@/lib/outbox/links";
import { useToast } from "@/components/toast";

type Who = { id: number; name: string; email: string | null; phone: string | null; whatsapp: string | null; preferredChannel: string | null };
type Task = { code: string; actionItem: string };

function reminderBody(name: string, tasks: Task[]): string {
  const lines = [`Hi ${name.replace(/^(Mr|Ms|Mrs|Miss|Dr|Chef|Eng)\.? /i, "")}, a quick reminder on your open items:`, ""];
  tasks.slice(0, 8).forEach((t) => lines.push(`• ${t.actionItem} (${t.code})`));
  lines.push("", "Please update the tracker when you can. Thanks.");
  return lines.join("\n");
}

export function useRemindPerson() {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  function remind(p: Who, tasks: Task[]) {
    if (!tasks.length) { toast(`${p.name} has no open tasks.`, { tone: "warn" }); return; }
    start(async () => {
      const res = await createPersonPackDraftAction({
        personId: p.id,
        purpose: "task-reminder",
        sections: "openTasks",
        channel: pickChannel(p),
        subject: "Reminder: your open items",
        body: reminderBody(p.name, tasks),
      });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(
        res.contactMissing
          ? `Draft saved in the Outbox — but ${p.name} has no contact details for it yet.`
          : res.created ? "Reminder drafted in the Outbox — nothing is sent until you send it." : "Already drafted today — it's waiting in the Outbox.",
        { tone: res.contactMissing ? "warn" : "success", duration: 6000 },
      );
    });
  }
  return { remind, pending };
}
