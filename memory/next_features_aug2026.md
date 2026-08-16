---
name: next-features-aug2026
description: The agreed next slice of work after the ERPNext rebuild — export any list, a global New menu, MCP Stage 4, keyboard navigation, plus the other candidates and what was deliberately deferred.
metadata:
  type: project
---

# What's next (agreed 16 Aug 2026)

The ERPNext programme is finished (see [[erpnext_redesign_plan]]). This is the
slice the owner picked afterwards, **in his order of interest**:

1. **Export any list** ← start here
2. **A proper global New menu**
3. **MCP Stage 4** (he asked to be told about it first — summary below)
4. **Keyboard navigation**

Then: **a pass over the staff portal**, which has had none of this work.

---

## 1. Export any list → spreadsheet

**Why it earns its place:** this system replaced an Excel workbook. Getting a
sheet back out — to send to an accountant, a lawyer, a bank — is the one thing
the old way did that this doesn't.

**Why it is cheap:** `RecordList` already knows the columns, which are hidden,
the current filters and the exact rows on screen. Everything needed is in one
component.

**The design:**
- One button in the list toolbar, next to the column chooser.
- Exports **what you are looking at** — current filters, current sort, current
  visible columns, in that column order. Not "everything in the table". If the
  footer says "12 of 300 shown", you get 12.
- CSV first (opens in Excel, no dependency). `xlsx` only if he asks for
  formatting.
- The file name should say what it is: `tasks-overdue-2026-08-16.csv`.

**Where:** add an `exportable` prop (or just always-on) to
`src/components/record-list.tsx`. Because every converted list already shares
that component, doing it once gives it to Tasks, People, Documents, Assets,
Vendors and Commitments at the same moment. **Do not** write a per-page export.

**Watch out:** the cell renderers return React nodes, not text
(`entity-cells.tsx`). Export needs a plain-text value per column — either add an
optional `exportValue` to the column metadata in `src/lib/entity-view.ts`, or
derive from the raw row. The metadata route is better and stays declarative.

---

## 2. A proper global New menu

**Today:** the sidebar's Create button shows whatever the current page
registered (`useRegisteredActions`), falling back to "New task". So on Documents
it says "Add document", on a task record it says "New task". That is decent, but
it can only ever create the thing the page you're on is about.

**What he wants:** one Create that can raise **any** record from anywhere —
ERPNext's `+ New` menu.

**The design:**
- Keep the page's own primary action as the default click (it is the right guess).
- Add a dropdown arrow beside it listing every creatable type: Task, Person,
  Company, Document, Vendor, Asset, Commitment, Event, Announcement.
- Each entry goes to that type's create route or opens its dialog.
- **Derive the list from metadata**, not a hard-coded array — add a `create`
  entry (label + href) to `ENTITY_VIEWS` in `src/lib/entity-view.ts` so a new
  record type appears in the menu for free. Same forward rule as everything else.
- ⌘K should offer the same list ("New task", "New person"…) so keyboard and
  mouse agree.

**Watch out:** several creates are *dialogs owned by a page*, not routes
(documents, assets, vendors). Those need either a real `/new` route or a URL the
owning page understands — `/documents?doc=<id>` is the precedent, and note the
bug that pattern already caused (a child dispatching an event its parent hadn't
subscribed to yet; see the comment in `documents-workspace.tsx`).

---

## 3. MCP Stage 4 — what it actually is

**Read `memory/mcp_stage4_automatic.md` for the original plan.** In plain terms:

Stages 1–3 and 5 are done. Today Claude can read COS and make safe changes, but
**only while the owner is talking to it**. Every action is a reply to a question.

**Stage 4 is the lane where COS asks Claude to do something, unprompted** — the
system wakes the assistant on a schedule or a trigger, instead of the other way
round. The groundwork is already in the repo and deliberately unused:
`src/lib/agent-context.ts` (gathers the facts a job needs, no API call) and
`src/lib/agent-apply.ts` (writes the result back, through the same guardrails).
Both carry a warning not to delete them for having no importers.

**What it would let him do:** "every Monday, look at what slipped last week and
draft the chase messages", or "when a document is 30 days from expiry, draft the
renewal task with the right company and owner" — without him asking.

**Why it is genuinely the riskiest thing on this list:**
- Everything else here is a button. This is software acting on its own.
- The existing safety spine already covers it — Tier 3 (send/spend/delete) never
  runs automatically without explicit opt-in; MCP never deletes and never sends
  a message, only drafts; every write registers an undo token. Stage 4 must obey
  all of it, and the temptation will be to carve exceptions. Don't.
- It costs AI spend on a timer rather than on demand. `aiMonthlySpendCap`
  defaults to 0 = unlimited, and `MODEL_RATES` carry no real prices, so **set a
  real cap before switching this on** or there is nothing to stop a runaway loop.

**My honest recommendation:** do this one **last**, after the other three and the
portal pass. The other three are visible, contained and reversible. This one is
none of those, and it is much easier to judge once he has lived with the
assistant doing the safe-write things for a while longer.

---

## 4. Keyboard navigation

**Why:** it is a large part of why ERPNext feels fast to someone in it all day.

**The design (list first, record second):**
- `j` / `k` or ↑ / ↓ move a highlight through list rows.
- `Enter` opens the highlighted record; `Escape` returns to the list.
- `/` focuses the list search.
- `x` ticks the row (feeds the existing bulk bar).
- On a record: `e` opens the Edit tab, `Escape` goes back to the list.
- A `?` overlay listing the shortcuts, or nobody will discover them.

**Where:** `record-list.tsx` again — one implementation, every list. The list
already tracks selection for bulk edit, so the highlight can reuse that state.

**Watch out:** don't capture keys while focus is in an input, a textarea or a
contenteditable — the single most common bug in this feature. Honour
`prefers-reduced-motion` for any scroll-into-view.

---

## Other candidates (raised, not yet chosen)

From the audit (`memory/` and the ERPNext gap report). Roughly in value order:

- **A comment thread on every record.** Only tasks have one. Being able to note
  something against a company, a document or a vendor — and @mention someone —
  is how context stays attached to the thing instead of living in chat.
- **Assign any record, not just tasks.** "This vendor contract is Yash's to
  chase" currently has to become a task.
- **Saved views for staff.** Saved views are owner-only; the portal task list
  would benefit from "my overdue work" as one tap.
- **Guided tours.** Already designed in `memory/onboarding_tours.md`, tables
  specified, nothing built. Worth doing **before** more staff get portal logins.
- **A "what ran overnight" card.** The old System status card was deleted with
  `/inbox` because half of it reported on removed document features. The useful
  half — *are my scheduled jobs actually running?* — is worth rebuilding small.
- **Bulk edit on more lists.** `RecordList` supports `bulkActions`; only some
  lists pass any.

## Deliberately NOT doing

- Reviving the document intelligence layer. Removed at his request; the rule
  stands — **AI may read and suggest, never file, rename or archive on its own.**
- Converting Pipeline / OECR / OCR / Attendance to `RecordList`. They are boards,
  grids and checklists, not record lists. ERPNext has kanbans too.

---

## State of play when this was written

- Records that are now real pages: **task, person, company, document, vendor,
  asset**. Commitments and pipeline are still list/board only.
- Dropdowns settled to two controls + `Combobox` — see `DESIGN_SYSTEM.md`.
- Navigation is one map (`NAV_GROUPS` in `src/lib/nav.ts`); Worlds is deleted.
- **A person can now be permanently deleted** — see below.
- Nothing is pushed. `master` locally has the redesign commit; `origin/master`
  does not.

### Permanent delete of a person (built 16 Aug 2026)

Deactivate was the only option, which cannot fix a duplicate or a typo.
`deletePersonForever` in `src/app/people/actions.ts`, surfaced as a **Danger
zone** block on the person record's sidebar.

- `personDeleteImpact()` counts what is attached and the dialog says it plainly,
  split into **kept but detached** (tasks, documents, assets, reports) and
  **destroyed** (assignments, audit trail, attendance, portal login).
- Requires the person's **exact name typed** to enable the button.
- ⚠️ **Four FKs to `people` are ON DELETE NO ACTION** — `tasks.owner_id`,
  `tasks.created_by_person_id`, `tasks.blocked_on_person_id` and
  `department_heads.head_person_id`. Postgres refuses the delete while any of
  them points at the row, so the action nulls them inside the transaction first.
  **If a new NO ACTION FK to `people` is added, this action must clear it too**
  or deleting starts failing for anyone who happens to be referenced.
- The search index entry is removed too, or the person stays findable after
  deletion.
