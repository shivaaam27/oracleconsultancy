"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";

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

/**
 * Downloads the server-generated Director Brief PDF. We hit the PDF route with
 * `?download=1`, which makes the server send `Content-Disposition: attachment`,
 * so the browser saves the file instead of opening it in the PDF viewer. A
 * same-tab navigation to an attachment URL downloads without leaving the page
 * (no blank tab), and works on desktop and mobile alike. We avoid the old
 * blob + synthetic `<a download>` trick — that was silently blocked on iOS
 * Safari and inside the installed app.
 */
export function BriefPdfButton({
  href,
  label = "Download PDF",
  variant = "secondary",
  size = "sm",
}: {
  href: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const url = href + (href.includes("?") ? "&" : "?") + "download=1";

    // ⚠️ THE WINDOWS APP CANNOT BE SENT ON A TOP-LEVEL NAVIGATION TO A FILE.
    //
    // WebView2 turns a navigation to an `attachment` response into a download
    // and then reports the NAVIGATION as failed — correctly, since no page
    // loaded. The app read that as "the site could not be reached" and put its
    // offline screen up over a working connection and a file that had just
    // saved. That window has no back button, so the only way out was closing
    // the app. (The app itself has been taught the difference; this half means
    // the fix does not wait on anyone reinstalling it.)
    //
    // So inside the app we FETCH the bytes and save them — no navigation, so
    // nothing can be mistaken for one. Every other browser keeps the same
    // same-tab navigation it has always used, which is deliberate: the blob +
    // `<a download>` route is silently ignored by iOS Safari, and this button
    // is used on a phone.
    if (inWindowsApp()) {
      setBusy(true);
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`${res.status}`);
        const blobUrl = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filenameFrom(res);
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Long enough for the save to have taken the bytes, short enough not to
        // hold a multi-megabyte PDF in memory for the rest of the session.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        return;
      } catch {
        // Fall through to the ordinary route rather than leaving the button dead.
      } finally {
        setBusy(false);
      }
    }

    // Navigating to an `attachment` URL downloads the file in place — the page
    // stays put, no blank tab.
    window.location.href = url;
  }

  return (
    <Button type="button" size={size} variant={variant} onClick={download} loading={busy}>
      {busy ? null : <Download size={14} />}
      {busy ? "Preparing…" : label}
    </Button>
  );
}
