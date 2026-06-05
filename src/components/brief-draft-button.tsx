"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createDirectorBriefDraftAction } from "@/app/brief/actions";
import type { BriefPeriod } from "@/lib/director-brief";

export function BriefDraftButton({
  period,
  companyId,
}: {
  period: BriefPeriod;
  companyId: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function run() {
    startTransition(async () => {
      const res = await createDirectorBriefDraftAction({ period, companyId });
      if (!res.ok) {
        toast(res.error, { tone: "warn", duration: 4000 });
        return;
      }
      toast(res.created ? "Director Brief draft created in Outbox." : "Draft already exists for today.", {
        tone: res.created ? "success" : "default",
        duration: 4000,
      });
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="secondary" onClick={run} disabled={pending}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
      Draft
    </Button>
  );
}
