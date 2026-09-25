---
name: command-centre
description: "The owner's control levers on Studio Home (Run the day, Controls held) and the Tax & Legal master pause"
metadata:
  node_type: memory
  type: project
---

# Owner controls on Home

The levers that switch Oracle's automatic behaviour on and off live on **Studio
Home** (`/`), in two cards under the kicker **"Controls"**. They are the
owner's alone: `StudioHomeServer` (`src/app/_hub/studio-home.tsx`) strips
"Run the day", "Controls held", "What ORI did", "Team today" and "Files" from a
director's or manager's Home, and does not even fetch their data.

(Naming note: `/hrms/command-centre` is the **Tax & Legal** page — a route name
only, unrelated to these controls.)

## "Run the day" — one-off actions

Rendered by `ActionsSlide` in `src/components/studio/home/studio-home.tsx`.

- **Run automations now** → `runAutomationsNowAction` (force-runs the engine:
  recurring tasks, reminders, renewals; still respects the master pause).
- **Send the Director Brief** → `sendBriefNowAction`, which calls
  `sendDirectorBriefToOwnerNow()` in `src/lib/reports/director-brief-send.ts` (shared
  with Settings): emails the brief to the owner, or saves an Outbox draft if
  email is not set up. It asks for a second tap before sending.

The card's subtitle says "Automations are paused" when they are.

## "Controls held" — switches

Rendered by `ControlsSlide`; each switch flips optimistically and rolls back on
error.

| Switch | Action | Stored as |
|---|---|---|
| Automations | `setAutomationPausedAction` | automation config `paused` |
| Director outreach | `setDirectorOutreachPausedAction` | `settings` key `director.outreachPaused` |
| AI | `setAiEnabledAction` | `AppSettings.aiEnabled` |
| Email (Live / Test mode) | `setEmailTestModeAction` | `email.testMode`; when email is not connected it links to `/settings#email-automation` |

A "Every setting →" link goes to `/settings`.

All actions are in `src/app/_hub/control-actions.ts`, each guarded and
revalidating `/` and `/settings`. **Keep the `director.outreachPaused` and
`email.testMode` keys in step with `src/app/settings/actions.ts`**, which writes
the same settings.

Beside them, **"What ORI did"** lists recent autonomous actions
(`listCockpitActivity` in `src/lib/automation/cockpit.ts`), each undoable.

## Tax & Legal master pause

One switch for the whole recurring-obligations area, in **Settings → Tax &
Legal** (`setCommandCentrePause` in `src/app/settings/actions.ts`; stored as
`AppSettings.commandCentrePaused`, default live).

When paused:

- `/hrms/command-centre` shows a paused placeholder (`StudioTaxPaused`);
- it drops out of navigation and ⌘K (`components/shell/nav-visibility.tsx`, provided
  from the root layout);
- `automation-time.ts` skips spawning obligation tasks;
- the statutory section leaves the Director Brief (`director-brief.ts`).

On resume, `automation.time.baseline` is reset to today's midnight so obligations
that fell due while paused are not back-filled.
