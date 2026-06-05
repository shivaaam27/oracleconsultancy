"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createDocumentRenewalTasksAction, createOverdueReminderDraftsAction } from "@/app/automation/actions";

type AutomationAction = "overdue-reminders" | "document-renewals";

export function AutomationActionButton({ action, label }: { action: AutomationAction; label: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = action === "document-renewals"
        ? await createDocumentRenewalTasksAction()
        : await createOverdueReminderDraftsAction();
      if (!res.ok) {
        toast(res.error, { tone: "warn", duration: 4000 });
        return;
      }
      const noun = action === "document-renewals" ? "renewal task" : "reminder draft";
      const already = action === "document-renewals" ? "Renewal tasks already exist for these documents." : "Reminder drafts were already prepared today.";
      const none = action === "document-renewals" ? "No documents need renewal tasks right now." : "No overdue assigned tasks need drafts right now.";
      const msg = res.created
        ? `Created ${res.created} ${noun}${res.created === 1 ? "" : "s"}${res.skipped ? `, skipped ${res.skipped}` : ""}.`
        : res.skipped
          ? already
          : none;
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
