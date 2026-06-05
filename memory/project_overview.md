---
name: project-overview
description: "What COS System is, who it is for, and what it currently does"
metadata:
  node_type: memory
  type: project
---

# COS System - Chief of Staff Command Centre

COS System is a single-operator web app for the principal / Chief of Staff of **Oracle Consultancy**. It runs weekly operations across 7 portfolio companies and replaces the old `Chief Of Staff Workflow - Live.xlsx` workbook with a database-backed command centre.

The app is intentionally single-user. There is no auth and no multi-tenant model. UI-created records usually use `createdBy = "web-ui"`; AI command mutations use `createdBy = "ai-command"`; Meeting Workspace task creation uses `createdBy = "meeting-mode"`.

## Companies

| Code | Name |
|---|---|
| CO01 | Dar Spices |
| CO02 | Cocozuri Chocolat |
| CO03 | Terra Green |
| CO04 | Oracle Consultancy |
| CO05 | PES Ltd |
| CO06 | MES Ltd |
| CO07 | Pamoja Plus |

Task codes use the company's two-letter `code_prefix`, e.g. `DS-001` for Dar Spices. Legacy `COxx-NNN` codes are kept in `tasks.legacy_code` so old links redirect.

## Main Workflows

- **Command centre** - `/` shows Overview, Companies, and Tasks tabs with KPIs, Needs Attention, risk, company breakdowns, and task views.
- **Task registry** - tasks have company, status, priority, deadline, owner/assignees, risk, escalation, comments, and latest update.
- **Timeline** - each task shows progress updates and audit-log field changes in one history stream.
- **Quick Capture** - embedded in the hub; turns typed or dictated natural-language task text into structured task data.
- **Meeting Workspace** - `/meeting` saves notes, generates minutes, extracts actions, links created tasks back to meetings, and keeps mobile capture compact.
- **Voice intelligence** - shared dictation clean-up for rough speech, with a COS vocabulary dictionary and initial English, Swahili, Hindi, and Gujarati language support.
- **Ask COS** - floating assistant and embedded chat answer questions and run commands over tasks, updates, companies, people, and now saved meeting minutes.
- **HRMS** (V2) - `/hrms` hub of registries: **OECR** office-equipment stock control (`/hrms/oecr`) and **OCR** daily cleaning checklist (`/hrms/ocr`). Companies, People and Documents live under HRMS, reached via a single centred "Go to" launcher on the HRMS nav icon.
- **Director Brief** (V2) - `/brief` glanceable portfolio report incl. completed/closed this month; share via WhatsApp/Email/Copy or print to a multi-page PDF report.
- **Documents & Compliance** - `/documents` tracks licences/contracts/visas with expiry reminders; AI reads uploads (text PDFs, images, and scanned/handwritten PDFs).
- **People** - internal, external, and expat contacts with company associations; bulk deactivate; notes surfaced on cards/popups.
- **Outbox** - creates per-person reminder drafts (priority + description + latest update) and records sends; real dispatch is not implemented yet.
- **Settings** - risk thresholds, weather location, AI master switch, reminders, navigation reorder, and resync.

## Current Product Direction

The app is moving towards a lightweight Chief-of-Staff operating system:

- less Excel-era page sprawl;
- more saved business memory;
- smarter but optional AI;
- better mobile/voice capture;
- eventually installable/offline shell and real message dispatch.

The next product layer is a Wispr Flow-style **COS-native voice intelligence** experience: voice input everywhere, context-aware clean-up, personal vocabulary, and multilingual support inside the site rather than system-wide.
