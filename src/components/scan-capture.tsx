"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Eye, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "./ui";
import { downscaleImage } from "@/lib/downscale-image";
import { narrateScanFrameAction, saveScanNarrationAction } from "@/app/documents/scan-narrate-actions";

type Page = { id: string; file: File; url: string };

const NARRATE_INTERVAL_MS = 2500;
// Small + low-quality on purpose — this is a disposable live caption, not the
// saved page (that's captured/downscaled separately at full quality).
const NARRATE_MAX_DIM = 900;
const NARRATE_QUALITY = 0.55;

/** Grab the current video frame as a canvas-drawn JPEG, capped to maxDim on the
 *  long edge. Shared by both the live caption (small/cheap) and "Capture this
 *  frame" (full quality, then downscaled the same way a picked file would be). */
function frameToBlob(video: HTMLVideoElement, maxDim: number, quality: number): Promise<Blob | null> {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, cw, ch);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
}

function frameToDataUrl(video: HTMLVideoElement, maxDim: number, quality: number): string | null {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, cw, ch);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * In-site document scanner — replaces "use your phone's scanner app then
 * upload the result". Two capture modes, both feeding the same `pages` list:
 *  - "Take a photo" (default, always available): a `capture="environment"`
 *    file input — the same mechanism every mobile browser already supports,
 *    no getUserMedia/video-preview plumbing, so it's the reliable path.
 *  - "Live view" (optional toggle): a getUserMedia camera preview that
 *    narrates what it sees every ~2.5s via the active provider's fast vision
 *    ladder (the "Gemini Live" FEEL without the real Live API — that's a
 *    separate session/quota-limited WebSocket product, wrong fit here; see
 *    memory/ai_provider_gemini.md). A shutter button grabs the current frame
 *    as a page. Every caption is kept and saved to ORI memory when the scan
 *    finishes, so what the camera saw is recallable later.
 * "Save as PDF" stitches all pages into one multi-page PDF (pdf-lib,
 * client-side) and hands the result back as a normal `File` — so it drops
 * into Smart Add's existing `picked` list and flows through the unchanged
 * Sort now / Save to inbox pipeline.
 */
export function ScanButton({ onScan }: { onScan: (file: File) => void }) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [live, setLive] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const narrateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const captionsRef = useRef<string[]>([]);

  function stopLive() {
    if (narrateTimerRef.current) { clearInterval(narrateTimerRef.current); narrateTimerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
    setCaption(null);
  }

  async function startLive() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      setLive(true);
      narrateTimerRef.current = setInterval(async () => {
        if (busyRef.current || !videoRef.current) return;
        const dataUrl = frameToDataUrl(videoRef.current, NARRATE_MAX_DIM, NARRATE_QUALITY);
        if (!dataUrl) return;
        busyRef.current = true;
        setNarrating(true);
        try {
          const res = await narrateScanFrameAction(dataUrl);
          if (res.ok && res.caption) {
            setCaption(res.caption);
            captionsRef.current = [...captionsRef.current, res.caption].slice(-40);
          }
        } finally {
          busyRef.current = false;
          setNarrating(false);
        }
      }, NARRATE_INTERVAL_MS);
    } catch {
      setError("Couldn't open the camera for live view — your browser or device may not support it. Use \"Take a photo\" instead.");
    }
  }

  async function captureLiveFrame() {
    if (!videoRef.current) return;
    const blob = await frameToBlob(videoRef.current, 2000, 0.85);
    if (!blob) { setError("Couldn't capture that frame — try again."); return; }
    const raw = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
    const file = await downscaleImage(raw);
    const url = URL.createObjectURL(file);
    setPages((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file, url }]);
  }

  useEffect(() => () => stopLive(), []);

  function reset() {
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    setPages([]);
    setError(null);
    setBuilding(false);
    captionsRef.current = [];
    stopLive();
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
      if (captionsRef.current.length > 0) {
        saveScanNarrationAction(captionsRef.current, name).catch(() => {}); // best-effort, don't block
      }
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
          {!live && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => inputRef.current?.click()}
                className="rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-6 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
                <Camera size={20} className="mx-auto text-accent" />
                <div className="mt-1 text-sm font-medium">{pages.length === 0 ? "Take a photo" : "Take another photo"}</div>
              </button>
              <button type="button" onClick={startLive}
                className="rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-6 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
                <Eye size={20} className="mx-auto text-accent" />
                <div className="mt-1 text-sm font-medium">Live view</div>
                <div className="text-[10px] text-fg-muted">ORI narrates as you point</div>
              </button>
            </div>
          )}

          {live && (
            <div className="space-y-2">
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 pt-6">
                  <p className="flex items-center gap-1.5 text-[12px] text-white/90">
                    {narrating ? <Loader2 size={11} className="animate-spin shrink-0" /> : <Sparkles size={11} className="shrink-0 text-accent" />}
                    <span className="truncate">{caption ?? "Point the camera at your document…"}</span>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={stopLive} className="px-3 py-2 text-sm rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted border border-border">
                  Stop live view
                </button>
                <Button type="button" size="sm" onClick={captureLiveFrame} className="w-full">
                  <Camera size={13} /> Capture this page
                </Button>
              </div>
            </div>
          )}

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
