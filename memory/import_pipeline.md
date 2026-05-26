---
name: import-pipeline
description: How the live Excel workbook is ingested into the database
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

Script: [scripts/import.ts](../scripts/import.ts). Run via `npx tsx scripts/import.ts` (no npm alias in package.json â€” add `"db:import": "tsx scripts/import.ts"` if you want one).

## Source
Default path: `C:/Users/User/Downloads/Chief Of Staff Workflow - Live.xlsx`. Override via `XLSX_PATH` env var.

## Sheets and order
1. **Companies** â€” hard-coded list of 7 companies (CO01â€“CO07). Idempotent: looks up by name, inserts only if missing.
2. **`_People Directory` sheet** â€” Name, Email, Phone Number, WhatsApp Number, Preferred Channel, Role, Company, Contact Status, Active, Notes. Upsert by name. Missing company name â†’ companyId left undefined.
3. **One sheet per company** (sheet name == company name, e.g. "Dar Spices") â€” task rows. Headers are in **row 2**, so `XLSX.utils.sheet_to_json(sheet, { range: 1 })`.
   Columns: ID, Action Item, Department, Owner, Created Date, Meeting Date, Deadline, Status, Priority, Category, Risk, Escalation, Comments, Latest Update, Last Updated, Closed Date, Accountable.
   - Code: uses `ID` if it matches `^CO\d+-\d+$`, otherwise generates `${companyCode}-${001..}`.
   - Department: auto-creates via `getOrCreateDept`.
   - Owner + Accountable: auto-creates people via `getOrCreatePerson` (name + companyId).
   - Existing tasks (by code) are **updated** â€” assignees deleted and re-inserted from current Accountable.
4. **`_Settings` sheet** â€” Setting, Value. Upsert by key.

## Date parsing
Excel serial numbers detected as `typeof v === "number"` â†’ converted via `(v - 25569) * 86400_000` ms.

## Why no transaction
The script does upserts row-by-row and tolerates partial failures (e.g. duplicate assignee insert is swallowed with `try {} catch {}`). The unique constraints on `companies.name/code`, `people.name`, `tasks.code`, `departments.name` provide idempotency.

## Re-runs
Safe to re-run. Will:
- Skip existing companies.
- Update existing people (overwrites fields from sheet).
- Update existing tasks (overwrites fields, replaces assignees).
- Update existing settings.
