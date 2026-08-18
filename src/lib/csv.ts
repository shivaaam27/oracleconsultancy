// ─────────────────────────────────────────────────────────────────────────────
// CSV — one place that knows how to turn rows into a file Excel will open.
//
// Small on purpose, and NOT project-specific: the roadmap item "export any
// list" will use these same three functions.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RFC-4180 quoting: quotes double up, and any value holding a comma, a quote or
 * a newline is wrapped. Without this a supplier called "Nelly, Mushy & Co"
 * silently becomes two columns and every figure after it shifts one place.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
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
