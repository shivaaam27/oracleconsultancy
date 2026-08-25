/**
 * `npm run desktop:upload`
 *
 * Puts the built installer into the private `desktop` storage bucket, under the
 * name src/lib/desktop-release.ts says it should have.
 *
 * ⚠️ THE BUCKET STAYS PRIVATE. The version endpoint mints a short-lived signed
 * link each time it is asked. A public bucket would be a permanent address
 * anybody could pass around for ever, and `npm run db:check-security` refuses
 * public buckets on purpose.
 *
 * ⚠️ IT UPLOADS, THEN CHECKS WHAT LANDED. The app refuses to run an installer
 * whose SHA-256 does not match the published one, so an upload that silently
 * truncated would not be dangerous — it would just leave every machine in the
 * company unable to update, with no obvious reason why. So this downloads the
 * object back and hashes it before saying the release is good.
 *
 * ⚠️ RUN THIS BEFORE DEPLOYING, never after. The deploy is what announces the
 * new version; announce it first and every app shows an update bar pointing at
 * a file that is not there yet.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP_BUCKET, DESKTOP_STORAGE_PATH, DESKTOP_VERSION } from "@/lib/desktop-release";

// ⚠️ `sb` is loaded INSIDE main(), not imported at the top. An import is hoisted
// above the dotenv calls, so the Supabase client would be built before the keys
// were in the environment and throw "NEXT_PUBLIC_SUPABASE_URL is not set".

async function main() {
    const file =
      process.argv[2] ??
      join(process.cwd(), "desktop-win", "installer", "out", "Oracle Consultancy Setup.exe");

    if (!existsSync(file)) {
      console.error(`Not found: ${file}\nBuild it first with desktop-win\\build-installer.cmd`);
      process.exit(1);
    }
    if (!DESKTOP_STORAGE_PATH) {
      console.error("DESKTOP_STORAGE_PATH is empty in src/lib/desktop-release.ts — nothing to upload as.");
      process.exit(1);
    }

    const { sb } = await import("@/db/supabase");

    const bytes = readFileSync(file);
    const local = createHash("sha256").update(bytes).digest("hex");

    console.log(`version: ${DESKTOP_VERSION}`);
    console.log(`file:    ${file}`);
    console.log(`size:    ${(bytes.length / 1048576).toFixed(1)} MB`);
    console.log(`sha256:  ${local}`);
    console.log(`→ ${DESKTOP_BUCKET}/${DESKTOP_STORAGE_PATH}\n`);

    const { error } = await sb.storage
      .from(DESKTOP_BUCKET)
      .upload(DESKTOP_STORAGE_PATH, bytes, {
        contentType: "application/octet-stream",
        // A release name carries its version, so it should never already exist —
        // but re-running after a failed step is normal, so replacing is allowed.
        upsert: true,
      });

    if (error) {
      console.error(`Upload failed: ${error.message}`);
      process.exit(1);
    }

    // Read it back. An upload that reported success but landed short would leave
    // every app unable to update, and the checksum is the only thing that says so.
    const { data, error: readErr } = await sb.storage.from(DESKTOP_BUCKET).download(DESKTOP_STORAGE_PATH);
    if (readErr || !data) {
      console.error(`Uploaded, but could not read it back: ${readErr?.message ?? "no data"}`);
      process.exit(1);
    }
    const landed = createHash("sha256")
      .update(Buffer.from(await data.arrayBuffer()))
      .digest("hex");

    if (landed !== local) {
      console.error(`\n✗ What landed does not match what was sent.\n  sent:   ${local}\n  landed: ${landed}\nDo NOT publish this checksum.`);
      process.exit(1);
    }

    console.log("✓ Uploaded and verified byte for byte.\n");
    console.log("Paste into src/lib/desktop-release.ts, then deploy:\n");
    console.log(`export const DESKTOP_SHA256: string = "${landed}";`);
}

main();
