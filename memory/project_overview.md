---
name: project-overview
description: "What the COS System is, who it's for, and what it does"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

# COS System — Chief of Staff Command Centre

A single-operator web app the principal of **Oracle Group** uses to run weekly operations across 7 portfolio companies. Replaces a sprawling Excel workbook (`Chief Of Staff Workflow - Live.xlsx`) with a real database-backed system.

**Repo root (primary):** `C:\Users\User\OneDrive\Documents\COS System\cos-system\`
**Backup copy:** `C:\dev\cos-system\` (mirror created 2026-05-26 for safety; OneDrive path is still the working tree)

Project-root `CLAUDE.md` is auto-loaded by Claude Code. Detailed handover notes live in `memory/` inside the project (mirrored from `~/.claude/projects/<key>/memory/`).

## What it does
- **Track action items** across companies with status, priority, deadlines, assignees, risk, escalation.
- **Capture** new tasks fast: natural-language quick capture (`/capture`) parses company, people, deadline, priority out of one sentence; AI polish rewrites them executive-style.
- **Extract** action items from raw meeting notes via Groq LLM (`/meeting`).
- **Surface risk** on the dashboard: derive.ts flags every task as overdue / due-soon / aging / stalled / escalated / on-track.
- **Generate reminders** per-person across WhatsApp / Email / SMS (`/outbox`) with idempotent dedupe.
- **Draft follow-up emails** per task via LLM (`/draft-email`).
- **Weekly digest** narrative paragraph generated from KPI stats (`/digest`).
- **Audit log** of every change with reason field; corrections table for fixing errors.
- **Daily snapshots** of company KPIs into a time-series table.

## Companies (Oracle Group portfolio)
| Code | Name |
|------|------|
| CO01 | Dar Spices |
| CO02 | Cocozuri Chocolat |
| CO03 | Terra Green |
| CO04 | Oracle Consultancy |
| CO05 | PES Ltd |
| CO06 | MES Ltd |
| CO07 | Pamoja Plus |

Codes are fixed and used as task code prefix: `CO01-001`, `CO02-042`, etc.

## Users
Single operator (the principal / Chief of Staff). No auth, no multi-tenant. `createdBy` is hard-coded to `"web-ui"`.
