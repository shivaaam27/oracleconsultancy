// Overdue-task reminders. AUTO mode emails each accountable person their overdue
// list (respecting the cooldown + daily cap); PREPARE mode leaves Outbox drafts.

import { sb } from "@/db/supabase";
import type { CategoryDef } from "../runtime";
import { appBaseUrl } from "@/lib/app-url";

export const overdueCategory: CategoryDef = {
  key: "overdue",
  scheduledToday: () => true, // daily
  async run(ctx, mode) {
    const rows = await ctx.tasks();
    let prepared = 0, sent = 0, skipped = 0;

    if (mode === "auto") {
      const { getOverdueReminderCandidates } = await import("@/lib/automation-suggestions");
      const { lastChasedByName } = await import("@/lib/outbox/history");
      const cands = getOverdueReminderCandidates(rows);
      const byPerson = new Map<number, typeof cands>();
      for (const t of cands) for (const pid of t.assigneeIds) { const l = byPerson.get(pid) ?? []; l.push(t); byPerson.set(pid, l); }
      const ids = [...byPerson.keys()];
      const { data: ppl } = ids.length ? await sb.from("people").select("id,name,email").in("id", ids) : { data: [] as any[] };
      const emailById = new Map((ppl ?? []).map((p: any) => [p.id as number, { name: p.name as string, email: (p.email as string | null) ?? null }]));

      // Cooldown: don't re-email anyone chased (any channel) within the window —
      // otherwise a daily auto-run nags the same person every morning.
      const chased = ctx.cfg.cooldownDays > 0 ? await lastChasedByName() : {};
      const chasedRecently = (name: string): boolean => {
        if (ctx.cfg.cooldownDays <= 0) return false;
        const lc = chased[name.trim().toLowerCase()];
        return !!lc && Date.now() - new Date(lc.sentAt).getTime() < ctx.cfg.cooldownDays * 86_400_000;
      };

      // Enforce the daily cap the Outbox advertises. Without it a switch to auto
      // (or a forced run) could mass-email.
      let budget = ctx.cfg.dailyCap;
      for (const [pid, tasks] of byPerson) {
        const person = emailById.get(pid);
        if (!person) { skipped++; continue; }
        if (chasedRecently(person.name)) { skipped++; continue; }
        if (budget <= 0) { skipped++; continue; }
        const body = `Hi ${person.name.split(" ")[0]}, a reminder of your overdue work:\n\n${tasks.map((t) => `• ${t.actionItem} (${t.code})`).join("\n")}\n\nPlease update the tracker when you can. Thank you.`;
        const r = await ctx.sendToPerson(person.email, "Your overdue tasks", body, {
          doc: {
            preheader: `You have ${tasks.length} overdue task${tasks.length === 1 ? "" : "s"}.`,
            title: "Your overdue tasks",
            subtitle: `Hi ${person.name.split(" ")[0]} — a quick reminder`,
            blocks: [{ kind: "list", bullets: tasks.map((t) => `${t.actionItem} (${t.code})`) }],
            cta: { label: "Open your tasks", url: `${appBaseUrl()}/portal` },
            footerNote: "Please update your tasks in the staff portal when you can. Thank you.",
            office: "admin",
          },
        });
        sent += r.sent; skipped += r.skipped;
        budget -= r.sent;
        // Log the auto-send so it shows in the Outbox sent log and feeds the
        // "chased Nd ago" hint + cooldown on the next run.
        if (r.sent > 0) {
          const iso = new Date().toISOString();
          await sb.from("outbox").insert({
            channel: "EMAIL", recipient_name: person.name, recipient_contact: person.email,
            subject: "Your overdue tasks", body, message_type: "OVERDUE TASK REMINDER",
            status: "Sent", source: "automation-overdue", person_id: pid,
            created_at: iso, sent_at: iso,
          });
        }
      }
    } else {
      const { createOverdueReminderDrafts } = await import("@/lib/automation-suggestions");
      const res = await createOverdueReminderDrafts(rows, { cooldownDays: ctx.cfg.cooldownDays });
      prepared = res.created; skipped = res.skipped;
    }

    return { prepared, sent, skipped };
  },
};
