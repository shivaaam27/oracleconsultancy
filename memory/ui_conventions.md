---
name: ui-conventions
description: "Shell layout, navigation pattern, design tokens, and component primitives"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Shell ([app/layout.tsx](../../../OneDrive/Documents/COS%20System/cos-system/src/app/layout.tsx))
```
<ThemeProvider>          // next-themes, dark default
  <ToastProvider>        // simple toast queue, components/toast.tsx
    <CommandPaletteProvider>  // Cmd+K via cmdk, searches /api/search
      <RecentsTracker /> // pushes route visits to /api/prefs/nav-recents
      <TopPill />        // floating top nav (pinned + recent + all routes via dropdown)
      <main className="pt-20 px-4 sm:px-6 lg:px-10 pb-12 mx-auto max-w-[1400px]">
        <PageTransition>{children}</PageTransition>  // framer-motion fade
      </main>
```

## Navigation
- Source of truth: [src/lib/nav.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/lib/nav.ts) — `NAV_ROUTES` (12 routes) and `DEFAULT_PINS = ["capture","digest","outbox","task","people"]`.
- Pins and recents stored as JSON blobs in the `settings` table, accessed via `/api/prefs/nav-pins` and `/api/prefs/nav-recents`.
- `use-pins.ts` client hook reads/writes pins.

## Design tokens (Tailwind v4, defined in `globals.css`)
Surfaces: `bg`, `bg-elev`, `bg-muted`, `bg-subtle`.
Text: `fg`, `fg-muted`, `fg-subtle`.
Borders: `border`.
Accents: `accent`, `danger`, `warn`, `success`.

Used throughout via classes like `bg-bg-elev`, `text-fg-muted`, `border-danger/25`.

## Primitives ([components/ui.tsx](../../../OneDrive/Documents/COS%20System/cos-system/src/components/ui.tsx))
`Card`, `PageHeader`, `SectionHeading`, `Stat`, `TableShell`, `Th`, `Td`, `Badge`, `EmptyState`. These wrap the design tokens.

Badge tones: `"default" | "success" | "warn" | "danger" | "info"`.
Stat tones: `"default" | "success" | "warn" | "danger"`.

## Interactive components
- `QuickCapture` (dashboard) — POSTs to `/capture` create action.
- `PolishedInput` — debounced call to `/api/polish` for any action-item textbox.
- `MeetingExtractor` — large textarea → `/api/extract-meeting` → editable preview list → bulk create.
- `DraftEmailButton` — per-task button → `/api/draft-email` → opens copyable subject/body.
- `DigestNarrative` — renders LLM-generated paragraph on `/digest`.
- `UpdateBox` — append a `task_updates` row, optional status change.
- `CopyButton` — clipboard helper.

## Conventions
- All list pages use `force-dynamic` to bypass cache (data changes frequently).
- Server actions call `revalidatePath` for affected routes then `redirect`.
- Form fields are uncontrolled HTML inputs; server actions read via `formData.get`.
