// Task reminders to staff — each person gets their OPEN tasks (overdue flagged),
// grouped by company, on Mon/Wed/Fri. AUTO emails them; PREPARE leaves an Outbox
// draft per person. Cooldown + daily cap apply, and (because this runs before the
// "overdue" safety-net in the registry) the cooldown stops anyone being double-
// chased on the same day.

import { sb } from "@/db/supabase";
import type { CategoryDef } from "../runtime";
import { eatWeekday } from "../runtime";

const REMINDER_DAYS = new Set([1, 3, 5]); // Mon, Wed, Fri (EAT)
const SOURCE = "automation-taskreminders";

export const taskRemindersCategory: CategoryDef = {
  key: "taskReminders",
  scheduledToday: (_cfg, now) => REMINDER_DAYS.has(eatWeekday(now)),
  async run(ctx, mode) {
    const { isOpen } = await import("@/lib/derive");
    const { buildTaskReminderDoc, buildEmailMessage } = await import("@/lib/outbox/gen");
    const { lastChasedByName } = await import("@/lib/outbox/history");

    const rows = (await ctx.tasks()).filter((t) => isOpen(t.status) && t.assigneeIds.length > 0);
    const byPerson = new Map<number, typeof rows>();
    for (const t of rows) for (const pid of t.assigneeIds) { const l = byPerson.get(pid) ?? []; l.push(t); byPerson.set(pid, l); }

    const ids = [...byPerson.keys()];
    const { data: ppl } = ids.length ? await sb.from("people").select("id,name,email").in("id", ids) : { data: [] as any[] };
    const personById = new Map((ppl ?? []).map((p: any) => [p.id as number, { name: p.name as string, email: (p.email as string | null) ?? null }]));

    // Cooldown: skip anyone chased (any channel) within the window.
    const chased = ctx.cfg.cooldownDays > 0 ? await lastChasedByName() : {};
    const chasedRecently = (name: string): boolean => {
      if (ctx.cfg.cooldownDays <= 0) return false;
      const lc = chased[name.trim().toLowerCase()];
      return !!lc && Date.now() - new Date(lc.sentAt).getTime() < ctx.cfg.cooldownDays * 86_400_000;
    };

    let prepared = 0, sent = 0, skipped = 0;
    let budget = ctx.cfg.dailyCap;

    for (const [pid, tasks] of byPerson) {
      const person = personById.get(pid);
      if (!person) { skipped++; continue; }
      if (chasedRecently(person.name)) { skipped++; continue; }

      const text = buildEmailMessage(person.name, tasks);
      const doc = buildTaskReminderDoc(person.name, tasks);

      if (mode === "auto") {
        if (!person.email) { skipped++; continue; }
        if (budget <= 0) { skipped++; continue; }
        const r = await ctx.sendToPerson(person.email, "Your Outstanding Tasks", text, { doc });
        sent += r.sent; skipped += r.skipped; budget -= r.sent;
        if (r.sent > 0) {
          const iso = new Date().toISOString();
          await sb.from("outbox").insert({
            channel: "EMAIL", recipient_name: person.name, recipient_contact: person.email,
            subject: "Your Outstanding Tasks", body: text, message_type: "AUTOMATION", status: "Sent",
            source: SOURCE, person_id: pid, created_at: iso, sent_at: iso,
          });
        }
      } else {
        // PREPARE: leave an Outbox draft to review and send by hand.
        await sb.from("outbox").insert({
          channel: "EMAIL", recipient_name: person.name, recipient_contact: person.email,
          subject: "Your Outstanding Tasks", body: text, message_type: "TASK REMINDER", status: "Draft",
          source: SOURCE, person_id: pid, created_at: new Date().toISOString(),
        });
        prepared++;
      }
    }

    return { prepared, sent, skipped };
  },
};
