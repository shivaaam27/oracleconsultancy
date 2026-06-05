---
name: ui-conventions
description: "Shell layout, navigation, interactive surfaces, voice, and responsive conventions"
metadata:
  node_type: memory
  type: project
---

# UI Conventions

## Shell

`src/app/layout.tsx` wraps the app with:

- `ThemeProvider`
- `ToastProvider`
- `UndoBanner`
- `CommandPaletteProvider`
- `RecentsTracker`
- full-width main content (`max-w-[1100px]`, bottom-padded for the pill)
- bottom `TopPill` (the single nav, all breakpoints)
- task drawer
- person drawer
- floating COS assistant + `AssistantSuggestions`

**The desktop sidebar was removed.** Navigation is now the **one bottom-floating pill on every breakpoint** (`top-pill.tsx`) — larger on `md+`. `sidebar.tsx` / `sidebar-server.tsx` are deleted. The pill is `relative` so the liquid lens overlay can sit inside it. Safe-area spacing for mobile.

## Navigation

Source of truth: `src/lib/nav.ts`.

Pins and recents are stored as JSON in the `settings` table through:

- `/api/prefs/nav-pins`
- `/api/prefs/nav-recents`

Settings contains the navigation reorder/pin UI.

## Design Tokens

Tailwind v4 tokens live in `src/app/globals.css`.

Common classes:

- backgrounds: `bg-bg`, `bg-bg-elev`, `bg-bg-subtle`, `bg-bg-muted`
- text: `text-fg`, `text-fg-muted`, `text-fg-subtle`
- borders: `border-border`
- semantic: `bg-accent`, `bg-danger`, `bg-warn`, `bg-success`

Prefer existing primitives from `src/components/ui.tsx` where they fit.

## Meeting Workspace

`src/components/meeting-extractor.tsx` is now a full workspace:

- meeting metadata card;
- raw notes prompt;
- minutes editor;
- Clean notes, Generate minutes, Extract actions;
- Extract decisions, Extract risks, Draft follow-up;
- editable Meeting intelligence output;
- searchable/filterable meeting history;
- linked tasks section;
- extracted task review cards and sticky create bar.

Keep this page work-focused and dense enough for repeated operational use. Avoid marketing-style hero sections.

Mobile Meeting layout should stay concise:

- hide the three-step explainer on phones;
- keep metadata in compact two-column rows where possible;
- keep raw notes and minutes shorter on first load;
- avoid large empty cards before the operator reaches notes/actions.

## Voice

`src/components/voice-button.tsx` uses the Web Speech API. It renders nothing on unsupported browsers.

Currently wired into:

- Quick Capture;
- Meeting Workspace raw notes;
- task updates;
- Ask COS dictation, using the browser speech language.

Voice should feel native to COS:

- "speak rough, save polished";
- clean dictation through `src/app/voice/actions.ts`;
- respect the Settings AI master switch;
- support English, Swahili, Hindi, and Gujarati dictation choices;
- preserve business vocabulary from the Settings voice dictionary;
- expose a lightweight quality loop where misheard names/phrases can be taught back.

## Floating COS Assistant

`src/components/floating-assistant.tsx` is the app-wide assistant launcher.

Mobile-specific behaviour:

- launcher sits above the bottom nav;
- launcher hides while the mobile sheet is open;
- sheet uses a solid elevated background to avoid transparency/readability problems.

The assistant reuses `AskCOS` in embedded/minimal mode.

## Pop-ups (unified shell)

All overlays share one design via `src/components/modal-shell.tsx` (`ModalShell`):

- mobile: an iOS-style **bottom sheet** with a grab handle and drag-to-dismiss;
- desktop: a centred glass card;
- consistent `glass-menu` surface, `rounded-3xl`, header (leading slot or
  title/subtitle · trailing actions · close), blurred scroll-locked backdrop;
- Esc / backdrop / drag all close.

Users:

- **New Task** modal — `RouteModal` (intercepting route `@modal/(.)task/new`)
  wraps `ModalShell`; the page underneath stays mounted, and `returnTo` sends the
  user back to their section on submit. The modal frame renders synchronously and
  streams the form via Suspense (no page-skeleton flash).
- **Task drawer** — `task-drawer.tsx` uses `ModalShell` too (opened via `?task=`).

While any `ModalShell` is open the **context action bar is suppressed**
(`useContextBarSuppressed`, counter-based in `ContextActionsProvider`).

## Context action — the nav-pill "+"

Pages still register their primary action via `useContextActions(...)` in
`src/components/context-actions.tsx` (the provider + `useRegisteredActions` /
`useContextBarSuppressed` are unchanged). **The standalone `ContextActionBar` is
no longer rendered** — instead `NavActionButton` (in `top-pill.tsx`) surfaces the
page's primary action as a single `+`/icon inside the nav pill, next to Search.
It mirrors the action's own icon; multiple actions open a small popover. The
wrapper is **always mounted** and springs its width 0↔auto, so it never
"disappears"/flashes and the pill resizes smoothly. Hidden via the same
suppression while a `ModalShell` is open.

## AI suggestion reveal

`src/components/assistant-suggestions.tsx` floats page-aware AI prompts above the
AUMIO pill without opening the panel: an idle circular chevron that, on **hover**
(desktop) or **swipe-up** (mobile), reveals ~4 context suggestions which genie
out of and retract into the chevron; tapping one runs it in the assistant. The
prompt set is shared with the chat home via `src/lib/page-suggestions.ts`.

## Liquid lens

The nav pill carries a draggable liquid-glass lens (drag a tab → release to
navigate, with refraction/chromatic-border optics). See `liquid_lens.md`.

## Create launcher

`src/components/capture-wizard.tsx` (mounted globally via `CaptureWizardMount`,
opened with `?capture=open`) is the universal **Create** launcher — a bottom-sheet
that creates a **Task, Meeting, Note, or To-do**, plus the original AI paste-capture
("what came in?" → suggested task/note). Deep-link straight to a form with
`?capture=open&create=task|meeting|note|todo` (+ optional `&companyId=`); the
Home / Tasks / Company action-bar buttons use this. Each form posts via its own
action (`createCaptureTask`, `saveMeeting`, `createNote`, `createTodo`) and ends on
a "done" step with an Open link. The full `/task/new` route modal still exists for
deep links / detailed task creation.

## Timeline

See `timeline.md`. The task drawer and the hub Timeline view's Activity feed share
the `TimelineEntry` component (icon node, actor, relative time, optional task chip).

## Responsive Rules

- Tables should scroll horizontally on phones rather than squish.
- Fixed-format controls should have stable dimensions.
- Use responsive grids for form rows.
- Avoid nested cards.
- Keep compact operational surfaces readable on mobile.

## Copy Conventions

- British English.
- Plain language for a non-technical owner.
- Avoid visible instructional bloat in the app; controls should be discoverable through labels, icons, and short status text.

## V2 nav update

Pill tabs are now: **Home · Director Brief · Task Management · Workbook · HRMS** + page-action `+` · Search · Theme. The **HRMS icon opens a single centred "Go to" launcher** (Radix Dialog, `HrmsLauncher` in `top-pill.tsx`) with every secondary destination (HRMS Hub, OECR, OCR, Companies, People, Documents, Outbox, Inbox, Insights, Settings). The old "More" sheet and the per-tab (HRMS/Workbook) popovers were removed for a minimal pill. The lens drag-targets are Home · Director Brief · Task Management · Workbook · Search. Shared `SearchInput` (icon + system styling) lives in `ui.tsx`.
