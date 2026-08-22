"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ExternalLink, Eye, EyeOff, FileText } from "lucide-react";
import { getDocumentFileLinkAction } from "@/app/documents/actions";

/**
 * One reusable preview for a document's stored file — used in the edit form, the
 * needs-review queue, the person drawer and the company files list. Click the
 * title/file name (or "Preview") to see the PDF/image inline without leaving the
 * screen; "Open" pops it in a new tab. Works from either a stored document id or
 * a freshly-picked local File (so you can preview before saving).
 */
export function DocPreview({
  documentId,
  file,
  fileName,
  label,
  defaultOpen = false,
  className = "",
}: {
  /** A stored document — its file is fetched via a short-lived signed URL. */
  documentId?: number;
  /** A local, not-yet-saved file — previewed straight from the browser. */
  file?: File | null;
  fileName?: string | null;
  /** Optional clickable label (defaults to the file name). */
  label?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const name = fileName ?? file?.name ?? "file";
  const isImage = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name) || (file?.type ?? "").startsWith("image/");
  const isPdf = /\.pdf$/i.test(name) || file?.type === "application/pdf";

  // Resolve a viewable URL: object URL for a local file, signed URL for a stored doc.
  async function resolve(): Promise<string | null> {
    if (file) {
      if (!objectUrl.current) objectUrl.current = URL.createObjectURL(file);
      return objectUrl.current;
    }
    if (documentId != null) {
      const res = await getDocumentFileLinkAction(documentId);
      return res.ok ? res.url : null;
    }
    return null;
  }

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (url) return;
    setLoading(true);
    setError(null);
    const u = await resolve();
    setLoading(false);
    if (u) setUrl(u);
    else setError("Couldn't open the file.");
  }

  async function openTab() {
    let u = url;
    if (!u) {
      setLoading(true);
      u = await resolve();
      setLoading(false);
      if (u) setUrl(u);
    }
    if (u) window.open(u, "_blank", "noopener,noreferrer");
    else setError("Couldn't open the file.");
  }

  if (documentId == null && !file) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-sm">
        <FileText size={14} className="text-accent shrink-0" />
        <button type="button" onClick={toggle} className="truncate flex-1 text-left hover:underline" title="Preview">
          {label ?? name}
        </button>
        <button type="button" onClick={toggle}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent shrink-0">
          {open ? <EyeOff size={13} /> : <Eye size={13} />} {open ? "Hide" : "Preview"}
        </button>
        <button type="button" onClick={openTab}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent shrink-0" title="Open in a new tab">
          <ExternalLink size={13} /> Open
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-bg-subtle/40 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-fg-muted">
              <Loader2 size={14} className="animate-spin" /> Loading preview…
            </div>
          )}
          {error && <div className="py-6 text-center text-xs text-danger">{error}</div>}
          {url && !loading && (
            isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={name} className="max-h-[420px] w-full object-contain bg-bg-muted/40" />
            ) : isPdf ? (
              <iframe src={url} title={name} className="w-full h-[460px] bg-white" />
            ) : (
              <div className="py-6 text-center text-xs text-fg-muted">
                Can&apos;t preview this file type here.{" "}
                <button type="button" onClick={openTab} className="text-accent hover:underline">Open it in a new tab</button>.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
