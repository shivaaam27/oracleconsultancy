---
name: ui-conventions
description: "Shell layout, navigation pattern, design tokens, and component primitives"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Shell ([app/layout.tsx](../src/app/layout.tsx))
```
<ThemeProvider>          // next-themes, dark default
  <ToastProvider>        // simple toast queue, components/toast.tsx
    <CommandPaletteProvider>  // Cmd+K via cmdk, searches /api/search
      <RecentsTracker /> // pushes route visits to /api/prefs/nav-recents
      <TopPill />        // BOTTOM-floating nav pill (pinned + recent + all routes via dropdown)
      <main className="pt-6 px-4 sm:px-6 lg:px-8 pb-28 mx-auto max-w-[1200px]">
        <PageTransition>{children}</PageTransition>  // framer-motion fade
      </main>
```
- `viewport` export in layout.tsx: `width:device-width, initialScale:1, maximumScale:1, userScalable:false` (the last two fix iOS Safari focus-zoom), `viewportFit:"cover"`, light/dark `themeColor`. `appleWebApp` metadata is set (PWA-ready, prep for 5a).
- The nav pill sits at `bottom-[calc(0.75rem+env(safe-area-inset-bottom))]` so it clears the iPhone home indicator under viewport-fit:cover.

## Navigation
- Source of truth: [src/lib/nav.ts](../src/lib/nav.ts) — `NAV_ROUTES` and `DEFAULT_PINS = ["meeting","outbox","people"]`. (Dashboard reached via the brand.)
- Pins and recents stored as JSON blobs in the `settings` table, accessed via `/api/prefs/nav-pins` and `/api/prefs/nav-recents`.
- `use-pins.ts` client hook reads/writes pins (`move`/`toggle`/`pin`/`unpin`).
- **Reorder UI:** Settings → "Navigation" card (`components/nav-settings.tsx`) lets the operator reorder (up/down), remove, and pin available routes; saves instantly via the nav-pins PUT.
- Stale legacy pins/recents (audit/capture/digest/escalations/hub/registry) are filtered at render by `ROUTE_BY_ID` — harmless.

## Voice dictation
- `components/voice-button.tsx` — reusable Web Speech API mic button. Renders nothing on unsupported browsers; pulsing red Stop while listening.
- Wired into **Quick Capture** (dictation appended to raw text; on stop auto-runs `parseRawCapture`) and the **Meeting extractor** (appends to notes; user clicks Extract → `parseMeetingNotes`). Speech feeds the same Groq parse pipelines, so it respects the AI master switch.

## Design tokens (Tailwind v4, defined in `globals.css`)
Surfaces: `bg`, `bg-elev`, `bg-muted`, `bg-subtle`.
Text: `fg`, `fg-muted`, `fg-subtle`.
Borders: `border`.
Accents: `accent`, `danger`, `warn`, `success`.

Used throughout via classes like `bg-bg-elev`, `text-fg-muted`, `border-danger/25`.

## Primitives ([components/ui.tsx](../src/components/ui.tsx))
`Card`, `PageHeader`, `SectionHeading`, `Stat`, `TableShell`, `Th`, `Td`, `Badge`, `EmptyState`. These wrap the design tokens.

Badge tones: `"default" | "success" | "warn" | "danger" | "info"`.
Stat tones: `"default" | "success" | "warn" | "danger"`.

## Interactive components
- `QuickCapture` (dashboard) â€” POSTs to `/capture` create action.
- `PolishedInput` â€” debounced call to `/api/polish` for any action-item textbox.
- `MeetingExtractor` â€” large textarea â†’ `/api/extract-meeting` â†’ editable preview list â†’ bulk create.
- `DraftEmailButton` â€” per-task button â†’ `/api/draft-email` â†’ opens copyable subject/body.
- `DigestNarrative` â€” renders LLM-generated paragraph on `/digest`.
- `UpdateBox` â€” append a `task_updates` row, optional status change.
- `CopyButton` â€” clipboard helper.

## Mobile / responsive conventions
- `TableShell` uses `overflow-x-auto` (was `overflow-hidden`) so every data table scrolls on phones instead of clipping.
- Because `w-full` shrinks a table to its container, data tables also need an explicit `min-w-[...]` so they scroll rather than squish. Current widths: people-table 680, company task table 640, tasks table-view 760, hub company-open-tasks 640, company-breakdown 560.
- Prefer responsive grid prefixes (`grid-cols-1 sm:grid-cols-2 …`) for form rows so they stack on mobile.

## Conventions
- All list pages use `force-dynamic` to bypass cache (data changes frequently).
- Server actions call `revalidatePath` for affected routes then `redirect`.
- Form fields are uncontrolled HTML inputs; server actions read via `formData.get`.
- British English throughout UI copy and LLM prompts.
