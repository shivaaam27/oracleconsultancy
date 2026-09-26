"use client";

/** True inside the Windows app (WPF + WebView2), false in every browser and in
 *  the installed PWA. `window.chrome` exists in Chrome and Edge; `chrome.webview`
 *  is injected only by WebView2, and is the same bridge the app's own offline
 *  screen talks to. */
function inWindowsApp(): boolean {
  const w = window as unknown as { chrome?: { webview?: unknown } };
  return typeof w.chrome?.webview !== "undefined";
}

/** The name the server asked us to save it under. */
function filenameFrom(res: Response): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : "director-brief.pdf";
}

/** Fetch the PDF as a file (no page navigation). */
export async function fetchPdf(href: string): Promise<File> {
  const url = href + (href.includes("?") ? "&" : "?") + "download=1";
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) throw new Error(`${res.status}`);
  return new File([await res.blob()], filenameFrom(res), { type: "application/pdf" });
}

/**
 * Hand a fetched PDF to the person.
 *  - A phone or tablet: the share sheet (Save to Files, WhatsApp, Mail…) —
 *    iOS ignores `<a download>`, and an installed app has no browser around
 *    it to show a PDF in.
 *  - A desk (and the Windows app): an ordinary download.
 * "blocked" = the phone wants a fresh tap before it will share (the tap that
 * started a slow fetch has gone stale); the caller shows a "Save" button.
 */
export async function savePdf(file: File): Promise<"done" | "blocked"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && !inWindowsApp() && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name.replace(/\.pdf$/i, "") });
      return "done";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "done"; // they closed the sheet
      if ((e as DOMException)?.name === "NotAllowedError") return "blocked";
      // anything else: fall through to a download
    }
  }
  const blobUrl = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Long enough for the save to take the bytes, short enough not to hold
  // the PDF in memory for the rest of the session.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  return "done";
}

/**
 * Downloads the server-generated Director Brief PDF.
 *
 * ⚠️ NEVER A PAGE NAVIGATION (26 Sept 2026). It used to send the page to the
 * PDF's address, and the PDF takes seconds to draw: the owner saw a blank
 * screen and, in the installed app, nothing at all. The Windows app could not
 * take a navigation to a file either (WebView2 reports it as a failed page).
 * Now the bytes are fetched behind a spinner and then saved or shared.
 * Only if the fetch itself fails do we fall back to opening the address.
 */
export async function downloadPdf(href: string, setBusy: (b: boolean) => void = () => {}, onBlocked?: (file: File) => void): Promise<void> {
  setBusy(true);
  try {
    const file = await fetchPdf(href);
    const r = await savePdf(file);
    if (r === "blocked") onBlocked?.(file);
  } catch {
    window.location.href = href + (href.includes("?") ? "&" : "?") + "download=1";
  } finally {
    setBusy(false);
  }
}
