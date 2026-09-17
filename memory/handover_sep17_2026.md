# Handover — 17 Sep 2026: the sign-in break, repeat-from-a-future-day, and events that end

Branch `claude/loving-sammet-c26363`, pushed to `master`. No migration.
Follows `memory/handover_sep15_2026.md`.

## 1. ⚠️ THE SIGN-IN BREAK — READ THIS BEFORE WRITING ANY `"use server"` FILE

Monday's work shipped one line that stopped the Administrator signing in:

```ts
// src/app/portal/(app)/tasks/automations-actions.ts — a "use server" file
export type { RecurringTaskInput, RecurringTaskRule };
```

**NOTHING BUT AN ASYNC FUNCTION MAY BE EXPORTED FROM A `"use server"` FILE — A
RE-EXPORTED TYPE INCLUDED.** Next's server-actions loader re-exports every name
the module exports as a *runtime* export; the type is not there at runtime, so
the module threw `ReferenceError: RecurringTaskInput is not defined` **while it
was being evaluated**, which took down every page whose action graph reaches it
— `/login` among them. Every POST to /login returned 500.

- ⚠️ **`export type Foo = {...}` (a declaration) is FINE** — ~30 `"use server"`
  files do it and always have. It is the **re-export form**, `export type { A }`
  of an imported name, that breaks. Sweep for `^export type {` / `^export {`.
- ⚠️ **`tsc` AND 1,361 TESTS PASSED, AND SO DID `npm run build`.** The
  production build compiles and generates all 38 pages, so **the live site was
  never broken** — only the dev server's stricter Turbopack transform. The one
  thing that would have caught it is *loading a page*, which is why the preview
  now gets opened after a change, not just the type-checker.

## 2. A repeating task set up for a future day no longer appears today

Owner, 17 Sep: set one up on Wednesday for Friday and **nothing should appear
until Friday** — saved, not created — with a tick box to also have one today.

- **`src/lib/recurring-task-rules.ts`** gained the pure, tested decision:
  `occursToday()` · `shouldCreateTodaysCopy()` · `todaysOccurrenceInstant()`.
  ⚠️ **Days are DAR days** (UTC+3) and a 31st-of-the-month rule clamps to the
  month's last day — the same clamp `nextRecurrenceInstant` uses, or the form
  and the engine would disagree about whether a rule is due.
- Wired into **both** create paths: `createTask` (admin) and
  `portalDirectorCreateTask` (director/manager). When nothing is due yet they
  call **`saveRuleOnly()`** (`task/recurring-actions.ts`) and create no task at
  all; the admin form then lands on `/task/recurring`.
- The forms show the same sentence the server acts on, because both call
  `occursToday`. When today IS a chosen day the tick box is replaced by a line
  saying it is created now — it is due today, not early.
- ⚠️ **FIXED A DOUBLE-CREATE:** making a repeating task **before 09:00 on one of
  its own days** put it on the board twice — once from the form, once from the
  job. Whenever a form creates today's copy the rule is stamped
  `last_fired_at = todaysOccurrenceInstant()`, so the job sees today as done.
  Tomorrow's occurrence is later, so the rule carries on.
- ⚠️ **MCP's `create_task` repeat is unchanged** (task + rule, as before). The
  rule-only branch lives in the two *form* wrappers, because `createTaskCore`'s
  contract is to return a task code.

## 3. An event that has finished stops being "still to come"

Owner: *"when the time has elapsed it should also end or go away but saved of
course."* **Nothing is deleted** — finished events stay on the calendar.

**`src/lib/event-time-shared.ts`** is the one answer (CLIENT-SAFE, 11 tests):
`eventEndsAt` · `hasElapsed` · `isHappeningNow` · `splitByElapsed`.

⚠️ **THE TWO SURFACES WERE WRONG IN OPPOSITE DIRECTIONS, and it is the same
missing idea — an event runs from its start to its END:**
- Home's "NOW" strip listed every event of the calendar day, so a 09:00 meeting
  sat there at 17:00. → finished ones drop out; it shows "N finished today".
- The portal's upcoming lists filtered `start_at >= now`, so a meeting
  **vanished the moment it began**. → `scopedUpcomingMeetings`,
  `upcomingEventsForPerson` and the Brief's `weekAhead` now read from a day
  earlier and let `hasElapsed` do the filtering.
- The calendar **agenda** keeps everything (it is the archive) but a finished
  event is dimmed, struck through and labelled **Finished**; the one under way
  gets **On now**; the day header reads "3 events · all done" / "1 of 3 left".
  It re-checks every 30s so a meeting changes state while you watch.
- ⚠️ **An event with NO end time is assumed to run an hour**, not to end the
  minute it starts. An **all-day** event lasts the whole Dar day. An end BEFORE
  the start is bad data and falls back rather than reading as already over.

## 4. Checked live

Signed in as the Administrator: the repeat tick box in both states on
`/task/new`, the calendar agenda's Finished/all-done, and Home's
"3 finished today". `tsc` clean · **1,388 tests** · production build green.
