/**
 * Fetch a (signed) image URL to a base64 data URI for use as an @react-pdf
 * <Image> src. @react-pdf v4 only decodes PNG/JPG (SVG/WebP/AVIF silently blank),
 * so we hard-guard the MIME type. Never throws: a missing/expired/odd image
 * resolves to null and the caller falls back to an accent dot. A short timeout
 * keeps a slow logo host from stalling the whole PDF render.
 */
const logoCache = new Map<string, { at: number; uri: string | null }>();
const LOGO_TTL_MS = 60 * 60_000;

export async function fetchLogoDataUri(url: string | null, timeoutMs = 5000): Promise<string | null> {
  if (!url) return null;
  // The same logo, shrunk once an hour — not fetched and resized on every PDF.
  const key = url.split("?")[0];
  const hit = logoCache.get(key);
  if (hit && Date.now() - hit.at < LOGO_TTL_MS) return hit.uri;
  const uri = await fetchLogoOnce(url, timeoutMs);
  if (uri) logoCache.set(key, { at: Date.now(), uri });
  return uri;
}

async function fetchLogoOnce(url: string, timeoutMs: number): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g)$/.test(mime)) return null; // PNG/JPG only
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 8_000_000) return null; // empty / absurd
    // ⚠️ SHRINK IT. A logo prints at ~24pt, but several were uploaded as
    // ~1MB PNGs and went into the PDF whole: the Report PDF was 4.2MB and
    // took seconds longer to draw (26 Sept 2026). 192px is sharp at that size.
    try {
      const sharp = (await import("sharp")).default;
      const small = await sharp(buf).resize(192, 192, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      return `data:image/png;base64,${small.toString("base64")}`;
    } catch {
      return buf.byteLength > 2_000_000 ? null : `data:${mime};base64,${buf.toString("base64")}`;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
