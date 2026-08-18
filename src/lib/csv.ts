// ─────────────────────────────────────────────────────────────────────────────
// CSV — one place that knows how to turn rows into a file Excel will open.
//
// Small on purpose, and NOT project-specific: the roadmap item "export any
// list" is built on these, and `RecordList` now uses them for every list.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RFC-4180 quoting: quotes double up, and any value holding a comma, a quote or
 * a newline is wrapped. Without this a supplier called "Nelly, Mushy & Co"
 * silently becomes two columns and every figure after it shifts one place.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  // ⚠️ A value beginning `=`, `+`, `-` or `@` is a FORMULA to Excel, so an item
  // called "-SPACER 10MM" runs as a subtraction, and a crafted one can run a
  // command on whichever machine opens the file. A leading tab keeps the text
  // visible and inert. Added when list export arrived, because a list exports
  // whatever somebody typed into it.
  if (/^[=+\-@]/.test(s)) s = "\t" + s;
  return /[",\r\n\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // ⚠️ A byte-order mark, deliberately. Without it Excel on Windows reads the
  // file as the system codepage, and every accented name arrives as mojibake.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** A downloadable response. `name` becomes the file name the browser saves. */
export function csvResponse(name: string, csv: string): Response {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + safe + '.csv"',
      "Cache-Control": "no-store",
    },
  });
}

/** "Patamela Villa" + "budget" → "Patamela-Villa-budget-2026-08-18". */
export function csvFileName(project: string, what: string, today = new Date()): string {
  const slug = project.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  return slug + "-" + what + "-" + today.toISOString().slice(0, 10);
}

/* ────────────────────────────────── exporting a list from the browser ────── */

/** "Order lines" → "order-lines-2026-08-18". The list twin of `csvFileName`. */
export function listFileName(name: string, today = new Date()): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (slug || "export") + "-" + today.toISOString().slice(0, 10);
}

/**
 * Hand the file to the browser.
 *
 * ⚠️ `toCsv` already puts the byte-order mark on, so this must NOT add another
 * — two of them and Excel shows a stray character in the first heading.
 */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".csv") ? fileName : fileName + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Best-effort plain text out of whatever a list column rendered.
 *
 * A column returns React, not a string, so this walks the tree collecting text.
 * Pieces are joined with a SPACE, because the common shape is a stacked cell —
 * "24322" over "VALVE 4 INCH" — and "24322VALVE 4 INCH" is worse than useless
 * in a spreadsheet.
 *
 * ⚠️ It is a FALLBACK. A column carrying a figure gives its own `csv`, so the
 * file gets 98491500 rather than "98,491,500" — which Excel reads as text and
 * will not add up.
 */
export function nodeText(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n === null || n === undefined || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      const t = String(n).trim();
      if (t) out.push(t);
      return;
    }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === "object") {
      const el = n as { props?: { children?: unknown } };
      if (el.props && "children" in el.props) walk(el.props.children);
    }
  };
  walk(node);
  return out.join(" ").replace(/\s+/g, " ").trim();
}
