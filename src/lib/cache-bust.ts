// One safe way to bust a cache tag, whichever kind of code is running.
//
// WHY THIS EXISTS. `updateTag()` throws outside a Server Action:
//
//   "updateTag can only be called from within a Server Action. To invalidate
//    cache tags in Route Handlers or other contexts, use revalidateTag instead."
//
// That was fine while every write came from a form. Since /api/mcp, the SAME
// helpers are also called from a route handler — and the throw landed AFTER the
// database write, so a tool reported failure for a change that had actually
// happened. A write that succeeds must not report as an error, so the cache call
// adapts to its context instead of the caller having to know.
//
// `updateTag` is kept as the preferred path because it refreshes immediately
// within an action, which is what the web UI depends on; `revalidateTag` with
// `expire: 0` is the route-handler equivalent.

import { revalidateTag, updateTag } from "next/cache";

export function bustTag(tag: string): void {
  try {
    updateTag(tag);
  } catch {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      // Neither worked (a plain script, a test). The write itself is already
      // committed — a stale cache is not worth failing it over.
    }
  }
}
