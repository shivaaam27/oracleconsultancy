// Issue a Claude access key and save it where the app can find it.
//
//   npm run mcp:key            → issues an owner key labelled "owner"
//   npm run mcp:key -- "phone" → issues one labelled "phone"
//
// Writes COS_MCP_KEY into .env.local (which is git-ignored, alongside every
// other secret this project holds) and stores only a SHA-256 fingerprint in the
// database. Nothing else needs doing: .mcp.json reads the key from there at
// connect time via scripts/mcp-auth-header.mjs, so the key never appears in a
// file that could be committed.
//
// Re-running replaces the saved key; the previous one keeps working until it is
// revoked in Settings → Security & Access → Claude access keys.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createHash, randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import postgres from "postgres";

const ENV_FILE = ".env.local";
const VAR = "COS_MCP_KEY";

function issue(): string {
  // Same shape as generateKey() in src/lib/mcp/auth.ts.
  return `cos_mcp_${randomBytes(32).toString("base64url")}`;
}

/** Set (or replace) one KEY=value line, leaving the rest of the file untouched. */
function upsertEnv(file: string, name: string, value: string): void {
  const line = `${name}=${value}`;
  if (!existsSync(file)) {
    writeFileSync(file, `${line}\n`, "utf8");
    return;
  }
  const body = readFileSync(file, "utf8");
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const next = pattern.test(body)
    ? body.replace(pattern, line)
    : `${body.replace(/\n*$/, "\n")}${line}\n`;
  writeFileSync(file, next, "utf8");
}

async function main(): Promise<void> {
  const label = (process.argv[2] ?? "owner").trim() || "owner";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check .env.local");

  const key = issue();
  const hash = createHash("sha256").update(key).digest("hex");

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const [row] = await sql`
      INSERT INTO mcp_keys (label, key_hash, person_id, created_at)
      VALUES (${label}, ${hash}, NULL, now())
      RETURNING id
    `;
    upsertEnv(ENV_FILE, VAR, key);
    console.log(`Issued key #${row.id} ("${label}") and saved it to ${ENV_FILE} as ${VAR}.`);
    console.log("Claude picks it up automatically — nothing to copy.");
    console.log("Revoke any time: Settings → Security & Access → Claude access keys.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
