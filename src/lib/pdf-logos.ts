/**
 * Fetch a (signed) image URL to a base64 data URI for use as an @react-pdf
 * <Image> src. @react-pdf v4 only decodes PNG/JPG (SVG/WebP/AVIF silently blank),
 * so we hard-guard the MIME type. Never throws: a missing/expired/odd image
 * resolves to null and the caller falls back to an accent dot. A short timeout
 * keeps a slow logo host from stalling the whole PDF render.
 */
export async function fetchLogoDataUri(url: string | null, timeoutMs = 5000): Promise<string | null> {
  if (!url) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g)$/.test(mime)) return null; // PNG/JPG only
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 2_000_000) return null; // empty / absurd
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
