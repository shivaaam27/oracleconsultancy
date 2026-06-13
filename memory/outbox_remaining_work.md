---
name: outbox-remaining-work
description: Deferred Outbox features still to build after the automation-hub pass
metadata:
  type: project
---

# Outbox — remaining work (deferred)

After the automation-hub + honest-labels + bug-fix pass (commit 00452bc, pushed), these are NOT yet built. Remind the owner about these **after** the Outbox layout redesign is done (owner asked on 2026-06-13 to redesign the page — "old, bulky, big and ugly" — modern design first, then revisit these).

**Needs owner setup (can't be coded alone):**
- Real WhatsApp send — scaffolded in `src/lib/whatsapp.ts`; blocked on owner's Meta WhatsApp Business account + verified number + approved templates. Until then WhatsApp/SMS "marked done" ≠ actually sent (only EMAIL truly dispatches).

**Buildable any time (priority order):**
1. Bulk actions — "Send all email drafts", "Copy top N overdue". Highest day-to-day value, no blockers.
2. "Last chased N days ago" inline per person, so you don't re-nudge someone contacted recently.
3. Schedule a draft — send later inside the 08:00–18:00 automation window.
4. Extend "Approve & send" to WhatsApp once real send lands.

See [[outbox-and-reminders]] for the full build history.
