/**
 * Where a task lives.
 *
 * A record is a PAGE with its own URL (the owner's decision, Aug 2026, matching
 * ERPNext). Everything that opens a task goes through here, so there is exactly
 * one answer to "what is the link to a task?" and changing it is a one-line job.
 *
 * `tab`  deep-links a tab on the record (conversation | overview | history | edit).
 * `list` is the ordered list of codes you were looking at, which powers the
 *        Prev/Next arrows on the record — pass it from a list view.
 */
export function taskHref(
  code: string,
  opts?: { tab?: "conversation" | "overview" | "history" | "edit"; list?: string[] }
): string {
  const params = new URLSearchParams();
  if (opts?.tab) params.set("dtab", opts.tab);
  // Cap the queue: a 200-task list would otherwise put ~1,600 characters in the
  // address bar (and browsers/proxies do have URL limits). 60 is far more
  // stepping than anyone does in one sitting.
  if (opts?.list?.length) params.set("tl", opts.list.slice(0, 60).join(","));
  const q = params.toString();
  return q ? `/task/${encodeURIComponent(code)}?${q}` : `/task/${encodeURIComponent(code)}`;
}
