// Hands Claude the COS access key at connection time.
//
// Referenced by .mcp.json as `headersHelper`. Claude runs this, reads the JSON it
// prints, and merges it into the connection headers. The point is that the key
// itself lives in .env.local (git-ignored) and never appears in .mcp.json — which
// IS committed, and would otherwise carry a live credential into the repository
// and on to GitHub.
//
// Issue or replace the key with:  npm run mcp:key

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readKey() {
  // .env.local first (where mcp:key writes), then .env as a fallback.
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const match = /^COS_MCP_KEY=(.*)$/m.exec(readFileSync(path, "utf8"));
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  return process.env.COS_MCP_KEY?.trim() || null;
}

const key = readKey();

// No key is not a crash: print empty headers and let the server answer 401, so
// the failure reads as "not authorised" rather than a broken helper script.
process.stdout.write(JSON.stringify(key ? { Authorization: `Bearer ${key}` } : {}));
