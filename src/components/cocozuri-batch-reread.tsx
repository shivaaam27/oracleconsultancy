"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/toast";
import { rereadRecipeAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * The recipe has moved on since this batch was opened.
 *
 * ⚠️ SAID, NEVER ACTED ON. There are two right answers and only the chef knows
 * which: the recipe was WRONG and has been corrected, so pull it in — or it was
 * changed for NEXT time, and this batch must go on being measured against what
 * it was actually made from. Re-reading it automatically would silently rewrite
 * the difference on a batch somebody is halfway through.
 * ------------------------------------------------------------------ */

export function CocozuriRereadRecipe({
  batchId, recipeName,
}: {
  batchId: number;
  recipeName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5">
      <p className="text-sm text-warn">
        <strong>{recipeName} has been changed since this batch was opened.</strong> This batch is
        still measured against the recipe it was started with, which is usually right.
      </p>
      <p className="mt-1 text-sm text-fg-muted">
        Pull the new one in only if the recipe was <em>wrong</em> and has been corrected. If it was
        changed for next time, leave this batch alone.
      </p>
      <button type="button" disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await rereadRecipeAction(batchId);
          setBusy(false);
          if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
          toast("The corrected recipe is now what this batch is measured against.", { tone: "success" });
          router.refresh();
        }}
        className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-warn/40 px-2 text-xs text-warn hover:bg-warn/10 disabled:opacity-60">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Use the corrected recipe
      </button>
    </div>
  );
}
