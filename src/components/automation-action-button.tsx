"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createOverdueReminderDraftsAction } from "@/app/automation/actions";

export function AutomationActionButton({ action, label }: { action: "overdue-reminders"; label: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    if (action !== "overdue-reminders") return;
    startTransition(async () => {
      const res = await createOverdueReminderDraftsAction();
      if (!res.ok) {
        toast(res.error, { tone: "warn", duration: 4000 });
        return;
      }
      const msg = res.created
        ? `Created ${res.created} reminder draft${res.created === 1 ? "" : "s"}${res.skipped ? `, skipped ${res.skipped} already prepared` : ""}.`
        : res.skipped
          ? "Reminder drafts were already prepared today."
          : "No overdue assigned tasks need drafts right now.";
      toast(msg, { tone: res.created ? "success" : "default", duration: 5000 });
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="primary" loading={pending} onClick={run}>
      {pending ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}
      {label}
    </Button>
  );
}
