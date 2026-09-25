"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/* Last-resort boundary: only fires when the ROOT layout itself errors (so it
 * must render its own <html>/<body>). Kept dependency-free and inline-styled so
 * it can never itself fail to render. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] fatal error:", error);
    Sentry.captureException(error);
  }, [error]);

  // The Studio card, inline-styled (no stylesheet is guaranteed here).
  const btn = { height: 40, padding: "0 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: 0, textDecoration: "none", display: "inline-flex", alignItems: "center" } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#F3F3F1", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 560, background: "#141517", color: "#F2F2F0", borderRadius: 24, padding: "32px 30px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
            <span aria-hidden style={{ width: 76, height: 76, borderRadius: 20, background: "#3A1D2C", color: "#F07BBE", fontSize: 44, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
            <span style={{ marginBottom: 6, height: 24, padding: "0 10px", borderRadius: 8, background: "#3A1D2C", color: "#F07BBE", fontSize: 12, display: "inline-flex", alignItems: "center" }}>Did not load</span>
          </div>
          <h1 style={{ margin: "24px 0 0", fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>Oracle didn’t load</h1>
          <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "#A3A6AB", maxWidth: "46ch" }}>
            Something went wrong before the page could draw. Try again — if it keeps happening, reload.
          </p>
          <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" onClick={() => reset()} style={{ ...btn, background: "#F2F2F0", color: "#111214" }}>Try again</button>
            <a href="/" style={{ ...btn, background: "transparent", color: "#F2F2F0", border: "1px solid #34363B", fontWeight: 400 }}>Home</a>
          </div>
          {error.digest && <div style={{ marginTop: 24, fontSize: 11, color: "#6E7177" }}>Reference {error.digest}</div>}
        </div>
      </body>
    </html>
  );
}
