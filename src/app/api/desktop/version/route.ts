import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import {
  DESKTOP_VERSION,
  DESKTOP_STORAGE_PATH,
  DESKTOP_BUCKET,
  DESKTOP_RELEASE_NOTE,
  DESKTOP_SHA256,
} from "@/lib/desktop-release";

/* ------------------------------------------------------------------ *
 * "Is the Windows app out of date, and where do I get the new one?"
 *
 * The desktop shell asks this once when it starts. If the version here is newer
 * than the copy on that machine, the app shows a bar — and, when there is an
 * installer to fetch, a Download button.
 *
 * ⚠️ PUBLIC ON PURPOSE, and it must stay that way. The shell asks BEFORE anyone
 * has signed in — it has no cookie — so behind the admin gate every check would
 * be answered with a redirect to /login and the app would never know it was out
 * of date. Hence `api/desktop` in the exclusion list in src/proxy.ts.
 *
 * What it gives away: a version number already stamped into every copy of the
 * app, and a short-lived link to an installer that contains no keys and no data.
 * No records, no names, no counts.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";

/** How long a download link stays valid. Long enough for a slow connection to
 *  finish, short enough that a copied link is not a permanent address. */
const LINK_SECONDS = 60 * 60;

/* ⚠️ The endpoint is PUBLIC, so anyone can ask it. Minting a fresh signed link
 * on every request would let someone generate them without limit — free
 * bandwidth on our storage, and a needless Supabase call per launch. So one
 * link is reused until it is close to expiring. In memory per instance, which
 * is enough: the worst case is a few extra links, not a flood. */
let cached: { url: string; until: number } | null = null;
const REUSE_MS = (LINK_SECONDS - 10 * 60) * 1000; // stop reusing 10 min before it dies

export async function GET() {
  let downloadUrl: string | null = null;

  // ⚠️ Both or neither. The app refuses to run a download it cannot check, so
  // offering a link without a checksum would only produce a dead button.
  if (DESKTOP_STORAGE_PATH && DESKTOP_SHA256) {
    try {
      if (cached && Date.now() < cached.until) {
        downloadUrl = cached.url;
      } else {
        const { data } = await sb.storage
          .from(DESKTOP_BUCKET)
          .createSignedUrl(DESKTOP_STORAGE_PATH, LINK_SECONDS);
        downloadUrl = data?.signedUrl ?? null;
        if (downloadUrl) cached = { url: downloadUrl, until: Date.now() + REUSE_MS };
      }
    } catch {
      // Storage unreachable — say there is no download rather than failing the
      // whole check. The app still learns it is out of date.
      downloadUrl = null;
    }
  }

  return NextResponse.json(
    {
      version: DESKTOP_VERSION,
      downloadUrl,
      sha256: downloadUrl ? DESKTOP_SHA256 : null,
      note: DESKTOP_RELEASE_NOTE || null,
    },
    {
      // ⚠️ NOT cacheable: the link is signed and short-lived, so a cached copy
      // would hand out an expired one.
      headers: { "Cache-Control": "no-store" },
    }
  );
}
