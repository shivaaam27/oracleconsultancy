/**
 * `npm run desktop:hash`
 *
 * Prints the SHA-256 of the built installer, ready to paste into
 * src/lib/desktop-release.ts.
 *
 * The app REFUSES to run a downloaded installer whose hash does not match this,
 * and refuses to download at all when it is empty — because downloading and
 * executing a file is exactly the pattern that must never be taken on trust.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const file =
  process.argv[2] ??
  join(process.cwd(), "desktop-win", "installer", "out", "Oracle Consultancy Setup.exe");

if (!existsSync(file)) {
  console.error(`Not found: ${file}\nBuild it first with desktop-win\build-installer.cmd`);
  process.exit(1);
}

const bytes = readFileSync(file);
const hash = createHash("sha256").update(bytes).digest("hex");

console.log(`file:   ${file}`);
console.log(`size:   ${(bytes.length / 1048576).toFixed(1)} MB`);
console.log(`sha256: ${hash}`);
console.log(`\nPaste into src/lib/desktop-release.ts:\n`);
console.log(`export const DESKTOP_SHA256: string = "${hash}";`);
