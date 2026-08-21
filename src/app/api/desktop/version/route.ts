import { NextResponse } from "next/server";
import {
  DESKTOP_VERSION,
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_RELEASE_NOTE,
} from "@/lib/desktop-release";

/* ------------------------------------------------------------------ *
 * "Is the Windows app out of date?"
 *
 * The desktop shell asks this once when it starts. If the version here is newer
 * than the copy on that machine, the app shows a bar saying so.
 *
 * ⚠️ PUBLIC ON PURPOSE, and it must stay that way. The shell asks BEFORE anyone
 * has signed in — it has no cookie — so behind the admin gate every check would
 * be answered with a redirect to /login and the app would never know it was out
 * of date. Hence `api/desktop` in the exclusion list in src/proxy.ts.
 *
 * Safe to be public: it returns a version number that is already stamped into
 * every copy of the app, and nothing else. No data, no names, no counts.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      version: DESKTOP_VERSION,
      // Empty string means "no download link yet" — the app then says you are
      // out of date without offering a button that leads nowhere.
      downloadUrl: DESKTOP_DOWNLOAD_URL || null,
      note: DESKTOP_RELEASE_NOTE || null,
    },
    {
      headers: {
        // Let it be cached briefly. The app checks once per launch, and the
        // answer changes a couple of times a year.
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
