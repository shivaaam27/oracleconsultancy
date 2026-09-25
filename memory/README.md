# Oracle — topic notes

`CLAUDE.md` (repo root) holds the rules and the traps; these notes hold the
detail for one area each. Read the note for the area you are touching, and
update it when you change that area. History lives in git, not here — when a
feature is removed, delete its note.

## Start here
- [project_overview.md](project_overview.md) — what Oracle is, who uses it, the main workflows
- [studio_redesign.md](studio_redesign.md) — **the design every page wears; read before any UI work**
- [repo_layout.md](repo_layout.md) — where things live
- [routes_and_pages.md](routes_and_pages.md) — every page, redirect, API route, cron and action file
- [open_issues.md](open_issues.md) — known gaps and leftovers (don't surprise-fix them)

## Engineering
- [tech_stack.md](tech_stack.md) — versions and every environment variable
- [dev_workflow.md](dev_workflow.md) — local setup, scripts, migrations
- [database_schema.md](database_schema.md) — every table, grouped by area; kept-but-unreachable tables
- [domain_model.md](domain_model.md) — companies, task codes, statuses, flags, risk
- [security.md](security.md) — the database lock, headers/CSP, open security backlog
- [auth_login.md](auth_login.md) — owner and staff sign-in, passkeys
- [ai_integration.md](ai_integration.md) — Gemini, the model ladder, every AI feature, spend cap

## People and the portal
- [portal.md](portal.md) — the staff portal: roles, scope, what each role sees
- [portal_unification_plan.md](portal_unification_plan.md) — one system, permissions decide (the Viewer)
- [portal_access.md](portal_access.md) — the one writer for roles and director scope
- [company_scoped_roles.md](company_scoped_roles.md) — directors limited to chosen companies
- [receptionist_cleaning.md](receptionist_cleaning.md) — the receptionist role and the cleaning log

## Features
- [calendar.md](calendar.md) — events, Google sync, reminders, invitations
- [meeting_as_task.md](meeting_as_task.md) — a meeting's actions become tasks
- [event_attachments.md](event_attachments.md) — papers that travel with an event
- [file_manager_plan.md](file_manager_plan.md) — Files: folders, upload, preview, Deleted
- [documents.md](documents.md) — manual filing, expiry tracking, "read it for me"
- [notes_module_plan.md](notes_module_plan.md) — Notes: design and trap log
- [notes_offline_plan.md](notes_offline_plan.md) — Notes offline
- [outbox_and_reminders.md](outbox_and_reminders.md) — Outbox, automations, reminders, the Report
- [emailwork.md](emailwork.md) — who email is sent as
- [hrms.md](hrms.md) — Tax & Legal, Assets & Vendors, Supplies, Cleaning, Attendance
- [command_centre.md](command_centre.md) — the owner's controls on Home
- [timeline.md](timeline.md) — timelines and activity
- [audit_trail.md](audit_trail.md) — what is logged, and how deletes keep history

## Search, ORI and MCP
- [ori_brain.md](ori_brain.md) — universal search / find / trace
- [ori_search_and_ai_reliability.md](ori_search_and_ai_reliability.md) — how search and answers work
- [ori_automations.md](ori_automations.md) — rule builder and the pinger
- [mcp_plan.md](mcp_plan.md) — Claude reaching into Oracle: architecture and stages
- [mcp_extending.md](mcp_extending.md) — what to do for MCP when Oracle grows
- [mcp_stage1_read_only.md](mcp_stage1_read_only.md) · [mcp_stage2_safe_writes.md](mcp_stage2_safe_writes.md) · [mcp_stage3_sign_in.md](mcp_stage3_sign_in.md) · [mcp_stage4_automatic.md](mcp_stage4_automatic.md) (planned) · [mcp_stage5_director_portal.md](mcp_stage5_director_portal.md)

## Other
- [playbook.md](playbook.md) — the "Intelligent System" playbook in `docs/` (a book, not a manual for this app)
