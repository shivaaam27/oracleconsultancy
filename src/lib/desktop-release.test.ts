import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP_VERSION, DESKTOP_DOWNLOAD_URL } from "./desktop-release";

/* The version COS publishes and the version stamped into the app are written in
 * two different files, in two different languages. If they drift, the failure is
 * SILENT AND COMPANY-WIDE: every installed app shows an "out of date" bar
 * pointing at a version that was never built. So the two are checked here. */

describe("desktop release", () => {
  const csproj = readFileSync(
    join(process.cwd(), "desktop-win", "OracleConsultancy.csproj"),
    "utf8"
  );

  it("matches the version stamped into the Windows app", () => {
    const m = csproj.match(/<Version>([^<]+)<\/Version>/);
    expect(m, "no <Version> in desktop-win/OracleConsultancy.csproj").toBeTruthy();
    expect(
      m![1].trim(),
      "DESKTOP_VERSION in src/lib/desktop-release.ts must match <Version> in desktop-win/OracleConsultancy.csproj"
    ).toBe(DESKTOP_VERSION);
  });

  it("is a version Windows and .NET can both compare", () => {
    // The app parses this with System.Version, which wants 2 to 4 numbers.
    expect(DESKTOP_VERSION).toMatch(/^\d+\.\d+(\.\d+){0,2}$/);
  });

  it("only offers a download link over https", () => {
    // Empty is fine and means "no link yet". Anything else must be https: the
    // app opens it in the person's browser.
    if (DESKTOP_DOWNLOAD_URL) {
      expect(DESKTOP_DOWNLOAD_URL.startsWith("https://")).toBe(true);
    }
  });
});
