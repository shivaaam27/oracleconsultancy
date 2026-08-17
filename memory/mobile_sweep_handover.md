---
name: mobile-sweep-handover
description: "IN PROGRESS — a page-by-page mobile sweep of the COS command centre. Read this first; the previous attempt measured geometry instead of LOOKING and must not be repeated."
metadata:
  node_type: memory
  type: project
---

# Mobile sweep of the command centre — handover

**Status: STARTED, NOT FINISHED. Two real bugs found and fixed; the sweep itself
needs redoing properly from the Task Management page onwards.**

## ▶ START HERE — the one thing to understand

The previous session built a JavaScript probe that measured **page overflow, tap-target
height and font size**, ran it per page, and called pages "clean" when those three
numbers looked right.

**That was the wrong method and the owner rightly stopped it.** Those numbers say a
page does not technically break. They say nothing about whether it *looks* right:
cramped spacing, ugly wrapping, weak hierarchy, controls that fit but sit awkwardly,
panels that stack into an endless scroll, text that is technically ≥11px but still
reads badly on a phone. **The owner can see all of that instantly and the probe was
blind to every bit of it.**

⚠️ **DO NOT REPEAT THAT APPROACH.** For each page:
1. **LOOK at it** — take a screenshot at 375px and actually study the layout. The
   owner has explicitly asked for this; the usual "no screenshots" token rule in
   CLAUDE.md is **overridden for this task**.
2. Then measure, as a second pass, to catch what the eye misses.
3. Fix, then **look again** before moving on. He asked for "double check before you
   move on" and meant it.

## The rule that must not be broken

**Mobile and web are separate. The web view must not change at all.** Everything so
far is inside `@media (max-width: 639px)` or `@media (hover: none)`, and each change
was verified at 1280px afterwards to prove the desktop was untouched. Keep doing that.

## What has been fixed so far (all verified both ways)

1. **Hover-only controls were unreachable on touch.** Nine components use
   `opacity-0 group-hover:opacity-100` — Reply on a message, remove on a row, saved-view
   actions. There is no hover on a phone, so **Reply was invisible and could not be
   used at all**. One rule in `globals.css` under `@media (hover: none)` fixes every
   one of them. Verified: opacity 1 on touch, still 0 on desktop.
   ⚠️ Written as `.opacity-0.group-hover\:opacity-100` — the first attempt used an
   `[class*="…"]` attribute selector and **Lightning CSS silently dropped the whole
   rule**. Always re-check the served stylesheet.
2. **16px tick-boxes were too small to tap.** `SelectCheckbox` on the task cards.
   A new `.tap-target` utility in `globals.css` gives a control a 40×40 invisible hit
   area on phones only, with no change to its size or to the layout. Verified: a tap
   14px above the box now hits it; on desktop the pseudo-element is `content: none`.
3. **Notes, from the earlier work in the same session:** the note toolbar wrapped to
   three rows on a phone (71px → 41px, one scrolling row), the `/` and `@` menus would
   have opened behind the on-screen keyboard (`visualViewport`), and the note title
   overflowed because it was a single-line input (now a wrapping textarea).

## What was "checked" and must be checked AGAIN, properly, by looking

Home · the command palette · the bottom nav pill · the Tasks list · `/task/[code]`.
These were passed on geometry alone. **Treat them as unchecked.**

## Not started at all

`/task/new` · `/people` and the person record · `/companies` and every tab ·
`/documents` · `/hrms/*` (Tax & Legal, Commitments, Applications, Attendance,
Supplies, Cleaning, Assets & Vendors) · `/calendar` · `/chat` · `/outbox` · `/brief` ·
`/insights` · `/settings` (its rail is the most likely to be cramped) · `/approvals` ·
`/announcements` · `/activity` · `/notes` and `/notes/[id]`.

**The owner asked to restart from Task Management.**

## Things noticed but NOT yet judged

- **38–44 visible elements at 10px** on a typical page. Defensible on a desk, small on
  a phone. A `@media (max-width: 639px)` bump of `.text-\[10px\]` to 11px would be
  surgical — but **look first** and decide whether it actually reads badly.
- **121 controls under 28px on the Tasks list.** Only the tick-box has been dealt
  with. The rest are inline meta buttons (17px) and card rows (22–26px).
- **`user-scalable=no, maximum-scale=1`** is set in the viewport meta. It stops iOS
  zooming when a small field is focused (so the many <16px inputs are safe) but it
  also **blocks pinch-to-zoom on Android**. Deliberate trade — the owner's call, left
  alone.
- The drag handle in the note editor is hover-driven and inert on touch.

## State of the code

| | |
|---|---|
| Branch | `claude/notes-phase-3-preview-0cc4c6`; **`master` is at `9c75e08`, 20 commits ahead of origin, NOT pushed** |
| Committed | Notes Phases 3 and 4 (`9c75e08`) |
| **UNCOMMITTED** | Notes Phases 5, 6, 7 and 8, migration **0122** (`note_revisions`, already applied to the live DB), and the two mobile fixes above. `tsc` clean, 323 tests pass, build passes |
| Live data | the owner's 4 imported notes, a daily page, and one untitled note he wrote himself = 6 rows. All test data cleaned up |

⚠️ **The owner uses the app while you work.** A note that appears mid-session is
probably his — read a row before deleting it. One of his was destroyed this way.
