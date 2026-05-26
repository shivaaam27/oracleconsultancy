---
name: import-pipeline
description: How the live Excel workbook is ingested into the database
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

Script: [scripts/import.ts](../../../OneDrive/Documents/COS%20System/cos-system/scripts/import.ts). Run via `npx tsx scripts/import.ts` (no npm alias in package.json — add `"db:import": "tsx scripts/import.ts"` if you want one).

## Source
Default path: `C:/Users/User/Downloads/Chief Of Staff Workflow - Live.xlsx`. Override via `XLSX_PATH` env var.

## Sheets and order
1. **Companies** — hard-coded list of 7 companies (CO01–CO07). Idempotent: looks up by name, inserts only if missing.
2. **`_People Directory` sheet** — Name, Email, Phone Number, WhatsApp Number, Preferred Channel, Role, Company, Contact Status, Active, Notes. Upsert by name. Missing company name → companyId left undefined.
3. **One sheet per company** (sheet name == company name, e.g. "Dar Spices") — task rows. Headers are in **row 2**, so `XLSX.utils.sheet_to_json(sheet, { range: 1 })`.
   Columns: ID, Action Item, Department, Owner, Created Date, Meeting Date, Deadline, Status, Priority, Category, Risk, Escalation, Comments, Latest Update, Last Updated, Closed Date, Accountable.
   - Code: uses `ID` if it matches `^CO\d+-\d+$`, otherwise generates `${companyCode}-${001..}`.
   - Department: auto-creates via `getOrCreateDept`.
   - Owner + Accountable: auto-creates people via `getOrCreatePerson` (name + companyId).
   - Existing tasks (by code) are **updated** — assignees deleted and re-inserted from current Accountable.
4. **`_Settings` sheet** — Setting, Value. Upsert by key.

## Date parsing
Excel serial numbers detected as `typeof v === "number"` → converted via `(v - 25569) * 86400_000` ms.

## Why no transaction
The script does upserts row-by-row and tolerates partial failures (e.g. duplicate assignee insert is swallowed with `try {} catch {}`). The unique constraints on `companies.name/code`, `people.name`, `tasks.code`, `departments.name` provide idempotency.

## Re-runs
Safe to re-run. Will:
- Skip existing companies.
- Update existing people (overwrites fields from sheet).
- Update existing tasks (overwrites fields, replaces assignees).
- Update existing settings.
