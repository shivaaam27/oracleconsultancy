// Single source of truth for the task closed-date transition (DUP-05).
//
// The rule "stamp closed_date when a task enters Completed/Closed, clear it when
// the task is reopened" was hand-rolled in 8+ places, and the portal copy
// diverged: it set closed_date on close but never cleared it on reopen, so a
// reopened task kept a stale closed_date and silently poisoned any
// closed-date-based reporting. Route every call site through `computeClosedDate`
// instead of re-deriving the rule.

const CLOSED_STATUSES = new Set(["Completed", "Closed"]);

/** A task status is "closed" when it is Completed or Closed. */
export function isClosedStatus(status: string | null | undefined): boolean {
  return status != null && CLOSED_STATUSES.has(status);
}

/**
 * Compute the closed_date for a status change.
 *
 * @param nextStatus      the status the task is moving to
 * @param prevClosedDate  the task's current closed_date (ISO string or null)
 * @param now             the timestamp to stamp on closing (defaults to now, UTC ISO)
 *
 * Returns:
 *   - a new UTC ISO timestamp when the task is *entering* Completed/Closed
 *     (and was not already there) — stamp the close;
 *   - `null` when the task is *leaving* Completed/Closed (reopening) — clear it;
 *   - the unchanged `prevClosedDate` otherwise (a move between two open
 *     statuses, or staying closed — never re-stamp an already-closed task).
 *
 * Pass the task's *previous* status to detect the edge: when you don't already
 * know whether it was closed, derive it from prevClosedDate being set is NOT
 * sufficient — callers that know prevStatus should use `computeClosedDateFrom`.
 */
export function computeClosedDate(
  nextStatus: string,
  prevClosedDate: string | null,
  now: string = new Date().toISOString()
): string | null {
  const goingClosed = isClosedStatus(nextStatus);
  if (goingClosed) {
    // Entering (or staying) closed: stamp once, keep the original close time if
    // it already had one (e.g. Completed → Closed should not move the date).
    return prevClosedDate ?? now;
  }
  // Open status: always clear, so a reopened task never carries a stale date.
  return null;
}

/**
 * Variant when the caller knows the previous status explicitly. Same contract as
 * `computeClosedDate` but only re-stamps on a genuine open→closed transition and
 * preserves the existing date on a closed→closed move.
 */
export function computeClosedDateFrom(
  prevStatus: string | null | undefined,
  nextStatus: string,
  prevClosedDate: string | null,
  now: string = new Date().toISOString()
): string | null {
  const wasClosed = isClosedStatus(prevStatus);
  const isClosed = isClosedStatus(nextStatus);
  if (isClosed && !wasClosed) return now; // closing now → stamp
  if (!isClosed && wasClosed) return null; // reopening now → clear
  if (isClosed) return prevClosedDate ?? now; // staying closed → keep
  return null; // staying open → no date
}
