"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, X } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "./ui";
import { downscaleImage } from "@/lib/downscale-image";

type Page = { id: string; file: File; url: string };

/**
 * In-site document scanner — replaces "use your phone's scanner app then
 * upload the result". Tapping the trigger opens the phone's native camera
 * (via a `capture="environment"` file input, the same mechanism every mobile
 * browser already supports — no getUserMedia/video-preview plumbing needed),
 * one photo per tap. Photos build up as pages; "Save as PDF" stitches them
 * into a single multi-page PDF (pdf-lib, client-side) and hands the result
 * back as a normal `File` — so it drops into Smart Add's existing `picked`
 * list and flows through the unchanged Sort now / Save to inbox pipeline.
 */
export function ScanButton({ onScan }: { onScan: (file: File) => void }) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    setPages([]);
    setError(null);
    setBuilding(false);
  }

  async function onCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (e.target) e.target.value = ""; // let the same input fire again for the next page
    if (!raw) return;
    setError(null);
    try {
      const file = await downscaleImage(raw);
      const url = URL.createObjectURL(file);
      setPages((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file, url }]);
    } catch {
      setError("Couldn't read that photo — try again.");
    }
  }

  function removePage(id: string) {
    setPages((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function saveAsPdf() {
    if (pages.length === 0) return;
    setBuilding(true);
    setError(null);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      for (const p of pages) {
        const bytes = new Uint8Array(await p.file.arrayBuffer());
        const jpg = await pdf.embedJpg(bytes);
        const { width, height } = jpg.scale(1);
        const page = pdf.addPage([width, height]);
        page.drawImage(jpg, { x: 0, y: 0, width, height });
      }
      const bytes = await pdf.save();
      const name = `Scan-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
      const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
      onScan(file);
      setOpen(false);
      reset();
    } catch {
      setError("Couldn't build the PDF — try again.");
      setBuilding(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-7 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
        <Camera size={22} className="mx-auto text-fg-subtle" />
        <div className="mt-1.5 text-sm font-medium">Scan a document</div>
        <div className="text-[11px] text-fg-muted">camera → auto PDF</div>
      </button>

      <HrmsDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
        width="md"
        title="Scan a document"
        sub="Take one photo per page — they'll be stitched into a single PDF."
      >
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCapture} />

        <div className="space-y-3">
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-6 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
            <Camera size={20} className="mx-auto text-accent" />
            <div className="mt-1 text-sm font-medium">{pages.length === 0 ? "Take a photo" : "Take another photo"}</div>
          </button>

          {error && <p className="text-[12px] text-danger">{error}</p>}

          {pages.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-fg-muted">{pages.length} page{pages.length === 1 ? "" : "s"} captured</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pages.map((p, i) => (
                  <div key={p.id} className="relative shrink-0">
                    <img src={p.url} alt={`Page ${i + 1}`} className="h-24 w-20 rounded-lg object-cover ring-1 ring-border/60" />
                    <span className="absolute left-1 top-1 rounded bg-bg/80 px-1 text-[10px] font-medium">{i + 1}</span>
                    <button type="button" onClick={() => removePage(p.id)}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-danger text-white shadow">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {pages.length > 0 && (
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">
                <RotateCcw size={13} /> Start over
              </button>
            )}
            <Button type="button" size="sm" onClick={saveAsPdf} disabled={pages.length === 0 || building}>
              {building ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              {building ? "Building PDF…" : pages.length === 0 ? "Save as PDF" : `Save ${pages.length} page${pages.length === 1 ? "" : "s"} as PDF`}
            </Button>
          </div>
        </div>
      </HrmsDialog>
    </>
  );
}
