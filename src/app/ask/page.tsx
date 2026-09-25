import { redirect } from "next/navigation";

/**
 * /ask used to queue a question for the ORI cloud worker, which has not
 * answered since 10 July 2026 — so the page waited for ever. Asking ORI lives
 * in "Ask or search" (⌘K) now, which answers straight away (26 Sept 2026).
 */
export default function AskPage() {
  redirect("/");
}
