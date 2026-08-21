"use client";

import { useEffect } from "react";
import { forgetCachedNotes } from "@/lib/offline-notes";

/**
 * Clear the device's copy of the notes.
 *
 * ⚠️ MOUNTED ON THE SIGN-IN SCREEN, and that is the whole trick. Signing out is a
 * server action — it clears a cookie and redirects — and a server action cannot
 * reach into the browser's own storage. But the sign-in screen is where you
 * always end up, whether you signed out, the session expired, or somebody else
 * opened the browser. The rule it enforces reads simply: **if this screen is
 * showing, this device should not be holding a readable copy of the notes.**
 *
 * ⚠️ IT DOES NOT TOUCH WRITING THAT HAS NOT BEEN SENT. Drafts and queued edits
 * are not a copy of anything — they are the only place those words exist — so
 * signing out must never be a way to lose them. `forgetCachedNotes` clears the
 * cached collection and nothing else, on purpose.
 *
 * Renders nothing.
 */
export function ForgetOfflineNotes() {
  useEffect(() => {
    void forgetCachedNotes();
  }, []);
  return null;
}
