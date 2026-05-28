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
- centred main content
- bottom `TopPill`
- task drawer
- person drawer
- floating COS assistant

The app uses a bottom-floating navigation pill and safe-area spacing for mobile.

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
