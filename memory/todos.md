---
name: todos
description: "The personal to-do list — capture, grouping, star, voice, assign, promote, surfacing"
metadata:
  node_type: memory
  type: project
---

# To-dos

The personal to-do list lives in **Workbook → To-do** and is used heavily by the owner. Backed by the `todos` table.

Source files:

- `src/components/workbook-todo.tsx` — the list UI (personal + by-company modes).
- `src/app/todos/actions.ts` — server actions (`listTodos`, `createTodo`, `updateTodo`, `toggleTodo`, `deleteTodo`, `promoteTodoToTask`, `createTodoReminderDraft`).
- `src/lib/todo-parse.ts` — natural-language quick-add parser.
- `src/components/today-todos.tsx` — Overview widget.
- AI: `src/app/api/ask/route.ts` (Plan my day).

## Capture & editing

- **Composer** with title, date, time, company, and **person** (assignee) pickers, plus a **voice** mic (dictate into the title via the shared voice layer).
- **Rapid entry**: after Add the composer stays open, clears the title, keeps date/company, and refocuses — fire several in a row.
- **Natural-language quick-add** (`parseTodo`): e.g. `Pay VAT friday 2pm #Dar Spices` → title "Pay VAT", Friday, 14:00, Dar Spices. `#` = company, `@Name` = person. Explicit field choices win over parsed values.

## Display & interaction

- Open items are **grouped by due date**: Overdue · Today · Tomorrow · This week · Later · No date (Overdue header in red). Within a bucket, **starred (important)** items float to the top.
- **Star** toggle (amber) per row.
- **Undo** on delete (deferred ~5s; flushes on unmount) and on mark-done.
- **Snooze** personal to-dos via the shared `SnoozeSheet` (reschedules `due_at`).
- **Mobile**: rows are `SwipeRow` — swipe right = done, swipe left = delete, tap = edit; star, **Remind** and **Promote** buttons are always-visible inline. Desktop reveals those on hover.
- "By company" mode is a separate view of open *tasks* with deadlines (not personal to-dos).

## Assign & outreach

- A to-do can be assigned to a **person** (`person_id`). The assignee shows on the row.
- **Remind [person]** (`createTodoReminderDraft`) creates a reminder **Draft in the Outbox** on their preferred channel **and** offers one-tap send (`wa.me`/`mailto:`/`sms:`). See `outbox_and_reminders.md`.

## Promote to task

- **Promote** (`promoteTodoToTask`) creates a real tracked task on the normal code path (`insertTaskWithUniqueCodeSb`): company code (e.g. `DS-001`), deadline from `due_at`, assignee from `person_id`, priority **High** when starred else Medium. It then links the to-do (`task_id`) and marks it done. Requires a company on the to-do.

## Surfacing

- **Overview widget** (`TodayTodos` in `cos-home.tsx`): today's + overdue personal to-dos with tick-to-complete; hidden when empty.
- **AI pill** offers "Plan my day"; the Ask route feeds today/overdue to-dos + due tasks + today's meetings into the model and asks for a time-ordered running order.

## Notes

- All times respect the app-wide `timestamptz` fix — they display in Dar es Salaam local time. The reminder message builder formats with an explicit `Africa/Nairobi` zone.
