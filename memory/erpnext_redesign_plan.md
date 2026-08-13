---
name: erpnext-redesign-plan
description: The owner wants COS rebuilt in the ERPNext shape — flat/dense look, uniform list+record screens, saved views and bulk edit. Staged plan, decisions taken, and the measurements behind them.
metadata:
  type: project
---

# COS in the ERPNext shape — the plan (Aug 2026)

**Status: PLANNED, NOTHING BUILT.** Advice given, decisions taken, one mockup made.
Stage 0 has not started. Read this whole file before touching any UI.

> The owner: *"I have ERPNext and I love the interface and design, can we do that
> for our site also?"*

## The mockup (look at this first)

**https://claude.ai/code/artifact/f149d8f1-628f-4804-bfff-909a540ebcea**

The Tasks page rebuilt in the ERPNext shape, using REAL data (40 open tasks, 21
overdue, real codes/owners/deadlines). Interactive: tick rows for the bulk bar,
press **Compact** for the density question, click a subject for the record page.
Source lives in the session scratchpad, not the repo — regenerate from this file
if it is needed again.

**Awaiting the owner's reaction to the mockup.** He had not commented when the
session ended, so treat its choices as proposals, not settled.

## What he chose

Asked what he loved about ERPNext, he picked **all four**:

1. **How it looks** — flat, grey, businesslike
2. **The density** — how much fits on screen
3. **That every screen works the same way** — list → record → sidebar → timeline
4. **The list power** — filters, saved views, bulk edit

Asked how far to go, he chose the largest option: **"Rebuild the structure to
match ERPNext too."** I had already put the case for a cheaper path (skin only,
or list-power only) and he chose this with that in front of him — so it is a
decision, not an unconsidered answer. Build it.

## The insight this plan rests on

**ERPNext's uniformity is not design discipline — it is METADATA.** Every DocType
is a definition, and one list view and one form view are *generated* for all of
them. That is why every screen behaves identically and why a new record type
costs nothing.

**COS already has the seed of it.** `src/lib/entity-registry.ts` defines each
entity — table, columns, indexable text, lifecycle, search mapping, trace mode —
and `CLAUDE.md` already carries the rule *"to make a new entity searchable, add
ONE EntityDef"*. Today it only drives search.

**So the route is: extend `EntityDef` with list columns, filters and form
sections, then generate the screens from it.** Not hand-copying ERPNext's layout
across 58 pages. Do it this way and uniformity, list power, and "add an entity →
get a screen free" all arrive together.

This is the single most important paragraph in this file.

## Measurements (already taken — do not re-measure)

| | |
|---|---|
| Page files (`src/app/**/page.tsx`) | **58** |
| Components (`src/components/*.tsx`) | **257** |
| App `.tsx` files | **121** |
| Files using design tokens | **299** |
| Files using raw Tailwind palette (`bg-gray-500` etc) | **1** |
| Token definitions in `globals.css` | **121** lines |
| `globals.css` | 963 lines |
| `DESIGN_SYSTEM.md` | 339 lines |

**The styling is unusually centralised** — that is why the skin is cheap. The
palette, radius ladder and dark mode all live in ~121 token lines in one file.
Changing them changes every screen at once, and it is reversible.

## The stages

Ordered so he can stop after any one and still be better off.

### Stage 0 — see it before committing (~half a day)
Re-skin the tokens on ONE page (Tasks) so he can judge COS flat/grey/tight beside
the current look, in the running app rather than a mockup. Fully reversible.

### Stage 1 — the skin (1–2 days)
- Rewrite the ~121 tokens in `globals.css`: ERPNext greys, flat surfaces, smaller
  radius, no glass/blur, tighter type scale.
- **Density switch (Comfortable / Compact)** stored in settings, applied as a
  root attribute so every screen honours it.
- Rewrite `DESIGN_SYSTEM.md` and the Aurora section of `CLAUDE.md` (see
  "Decision to record" below).

### Stage 2 — the two shells (~1 week)
Build `RecordList` and `RecordPage`:
- **List**: filter bar, left filter rail with counts, sortable columns, row
  selection → bulk action bar, footer count/page size, saved-view slot.
- **Record**: header (title, status, primary action, ⋯), tabs, collapsible
  sections in a 2-column field grid, right sidebar (assigned / attachments /
  tags), activity timeline at the bottom.

Prove both on **Tasks** end to end before generalising.

### Stage 3 — the metadata (~1 week)
Extend `EntityDef` with `listColumns`, `filters`, `formSections`. Drive both
shells from it. **This is the stage that makes it ERPNext rather than a
lookalike.**

### Stage 4 — roll out (2–4 weeks)
One area at a time, each shippable on its own:
Tasks → People → Documents → Companies → Assets & Vendors → HRMS registers
(pipeline, commitments, OECR, OCR, attendance).

### Stage 5 — list power (~1 week)
Saved views, bulk edit, report/grid mode, column chooser. Built once against
`RecordList`; every list gets it.

**Realistically 6–9 weeks of focused work.**

## Explicitly OUT of the structural rebuild

These adopt the new **skin** (Stage 1) but keep their bespoke shapes. Raised with
the owner; he did not object, but he also did not explicitly confirm — **check
before converting any of them.**

- **The staff portal** (`/portal/**`). Phone-first, used by staff. ERPNext's own
  mobile experience is its weakest part and density on a phone is a downgrade.
- **The calendar** (`/calendar`). A calendar rendered as a list view is strictly
  worse.
- **Chat** (`/chat`).
- **The command centre home and Director Brief.** Glance surfaces, not record
  lists — "every number is a door" is the point of them.

## The mockup's design tokens (Stage 1 can lift these directly)

Follows Frappe/ERPNext's own palette — a blue-biased grey family, one workmanlike
blue, semantic colour kept separate from the accent.

```
light   page #f4f5f6   surface #ffffff   surface-alt #fafbfc
        line #e2e6e9   line-soft #edf0f2
        ink  #1f272e   ink-muted #6b757d   ink-subtle #8d99a6
        accent #2490ef  accent-soft #eaf3fd
        red #d13d3d  amber #b7791f  green #2f9461  violet #7857c9

dark    page #15181b   surface #1c2126   surface-alt #20262c
        line #2c343b   line-soft #262d33
        ink  #e7ebee   ink-muted #9aa5ae   ink-subtle #78838c
        accent #4aa3f5  accent-soft #17293b
        red #f07171  amber #dda44b  green #5cc08a  violet #a58ae8

radius  6px controls · 8px cards        density  9px row padding / 13px
                                                 → 4px / 12px when compact
```

ERPNext uses **Inter**. The mockup used the system stack because the artifact
sandbox blocks font CDNs; the real app can load Inter properly.

## Decision to record before Stage 1

`CLAUDE.md` and `DESIGN_SYSTEM.md` currently mandate Aurora — *"Every new page,
dialog, pop-up, search surface, panel or feature uses Aurora by default."* This
programme supersedes that standing rule. **Rewrite both in Stage 1**, otherwise
the next session will faithfully rebuild something in liquid glass. Until Stage 1
lands, Aurora remains the rule — see the note at the top of `DESIGN_SYSTEM.md`.

## Open questions for the next session

1. **What did he think of the mockup?** Ask first. Particularly: should **compact
   be the default**, or the toggle default to comfortable?
2. **Is the record page layout right** — tabs across the top, sidebar on the
   right, timeline at the bottom?
3. **Confirm the out-of-scope list above**, especially the portal.
4. Does he want **Inter** loaded, or keep the system font?

## Related

- [[design_system]] — `DESIGN_SYSTEM.md`, the Aurora reference being superseded
- `src/lib/entity-registry.ts` — the metadata layer this plan builds on
- `src/app/globals.css` — the ~121 tokens Stage 1 rewrites
