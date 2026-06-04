import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Card } from "@/components/ui";
import { ensureDefaultAreas, listAreas } from "@/lib/cleaning";

export const dynamic = "force-dynamic";

export default async function OcrPage() {
  // Self-heal: make sure the default areas exist the first time this opens.
  await ensureDefaultAreas();
  const areas = await listAreas();

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <Link href="/hrms" className="inline-flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-0.5 hover:underline">
          <ChevronLeft size={12} /> HRMS
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">OCR</h1>
        <div className="text-xs text-fg-subtle">Office Cleaning Registry</div>
        <div className="text-xs text-fg-muted mt-0.5">{areas.length} cleaning areas · daily checklist coming next</div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
            <Sparkles size={16} />
          </div>
          <div className="text-sm font-medium">Cleaning areas</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {areas.map((a) => (
            <div key={a.id} className="text-sm px-3 py-2 rounded-lg bg-bg-subtle/60 border border-border">
              {a.name}
            </div>
          ))}
        </div>
        <p className="text-xs text-fg-subtle mt-4">
          These are the areas the cleaner ticks off each day (your paper register's columns). They&apos;ll be
          fully editable in a later step. Next, the daily checklist — tick areas, add comments, record attendance,
          and sign off — lands here.
        </p>
      </Card>
    </div>
  );
}
