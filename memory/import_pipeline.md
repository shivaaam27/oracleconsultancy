---
name: import-pipeline
description: "How the Excel workbook is imported"
metadata:
  node_type: memory
  type: project
---

# Import Pipeline

Script: `scripts/import.ts`.

Run:

```bash
npx tsx scripts/import.ts
```

There is no npm alias yet.

## Source

Default path:

`C:/Users/User/Downloads/Chief Of Staff Workflow - Live.xlsx`

Override with `XLSX_PATH`.

## Sheets

1. Companies - hard-coded 7-company Oracle Group list.
2. `_People Directory` - people/contact records, upserted by name.
3. One sheet per company - task rows.
4. `_Settings` - key/value settings.

## Task Import

Company sheets use headers from row 2.

Key fields include:

- ID
- Action Item
- Department
- Owner
- Created Date
- Meeting Date
- Deadline
- Status
- Priority
- Category
- Risk
- Escalation
- Comments
- Latest Update
- Last Updated
- Closed Date
- Accountable

Existing tasks are matched by code and updated. Assignees are replaced from the current Accountable value.

## Date Parsing

Excel serial numbers are converted to JS dates. String dates are parsed by the script.

## Idempotency

The import is designed to be safe to re-run:

- companies are skipped if present;
- people are upserted by name;
- tasks are updated by code;
- settings are upserted by key.

## Current Limitations

- No `db:import` npm alias.
- Import does not create Meeting Workspace records.
- Import does not write audit rows for imported changes.
