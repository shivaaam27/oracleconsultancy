import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP_VERSION, DESKTOP_STORAGE_PATH, DESKTOP_SHA256 } from "./desktop-release";

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

  it("never offers an installer without a checksum to check it against", () => {
    // The app downloads this file and RUNS it. A path without a hash would be
    // an unverifiable download, so the two must travel together or not at all.
    expect(
      Boolean(DESKTOP_STORAGE_PATH) === Boolean(DESKTOP_SHA256),
      "DESKTOP_STORAGE_PATH and DESKTOP_SHA256 must both be set, or both empty"
    ).toBe(true);
  });

  it("has a checksum of the right shape", () => {
    if (DESKTOP_SHA256) expect(DESKTOP_SHA256).toMatch(/^[a-f0-9]{64}$/);
  });
});
