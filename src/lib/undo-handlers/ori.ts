import { sb } from "@/db/supabase";
import { registerUndoHandler } from "../undo";
import { reindexEntity } from "@/lib/index-hooks";

/* Undo handlers for ORI-agent tool actions that the shared task handlers don't
 * cover: reassign (needs owner_id restored), calendar events, draft announcements.
 * Registered via undo-handlers.ts and consumed by /api/undo, exactly like the rest. */

// Reassign — restore the previous owner + assignee list.
registerUndoHandler("ori.task.reassign", async (raw) => {
  const p = raw as { taskId: number; prevOwnerId: number | null; prevLastUpdatedAt: string | null; prevAssignees: number[] };
  await sb.from("tasks").update({ owner_id: p.prevOwnerId, last_updated_at: p.prevLastUpdatedAt }).eq("id", p.taskId);
  await sb.from("task_assignees").delete().eq("task_id", p.taskId);
  for (const personId of p.prevAssignees) {
    await sb.from("task_assignees").upsert({ task_id: p.taskId, person_id: personId }, { ignoreDuplicates: true });
  }
  void reindexEntity("task", p.taskId);
});

// Calendar event creation — delete the event.
registerUndoHandler("ori.event.create", async (raw) => {
  const p = raw as { eventId: number };
  await sb.from("calendar_events").delete().eq("id", p.eventId);
});

// Draft announcement — delete the draft (it was never published).
registerUndoHandler("ori.announcement.draft", async (raw) => {
  const p = raw as { announcementId: number };
  await sb.from("announcements").delete().eq("id", p.announcementId);
});

// Automation rule creation — delete the rule (before it has fired).
registerUndoHandler("ori.automation.create", async (raw) => {
  const p = raw as { ruleId: number };
  await sb.from("automation_rules").delete().eq("id", p.ruleId);
});

// Watcher creation — delete the watch rule (it's a fresh, unfired standing alert).
registerUndoHandler("ori.watcher.create", async (raw) => {
  const p = raw as { ruleId: number };
  await sb.from("automation_rules").delete().eq("id", p.ruleId).eq("kind", "watch");
});

// Watcher deletion — revive it (deleteWatcher is a soft active=false, so the
// inverse just flips it back on).
registerUndoHandler("ori.watcher.delete", async (raw) => {
  const p = raw as { ruleId: number };
  await sb.from("automation_rules").update({ active: true }).eq("id", p.ruleId).eq("kind", "watch");
});

// Person profile edit — restore the whitelisted columns to their prior values.
registerUndoHandler("ori.person.update", async (raw) => {
  const p = raw as { personId: number; before: Record<string, unknown> };
  await sb.from("people").update(p.before).eq("id", p.personId);
});

// Probation date change — restore the prior probation_end_date.
registerUndoHandler("ori.person.probation", async (raw) => {
  const p = raw as { personId: number; before: string | null };
  await sb.from("people").update({ probation_end_date: p.before }).eq("id", p.personId);
});

// Leave decision — restore the request's prior status + decision fields.
registerUndoHandler("ori.leave.decide", async (raw) => {
  const p = raw as { id: number; before: Record<string, unknown> };
  await sb.from("leave_requests").update(p.before).eq("id", p.id);
});

// Attendance record — restore the person/day's prior status (or delete if there
// was no row before).
registerUndoHandler("ori.attendance.record", async (raw) => {
  const p = raw as { personId: number; dateIso: string; before: string | null };
  if (p.before == null) {
    await sb.from("attendance").delete().eq("person_id", p.personId).eq("date", p.dateIso);
  } else {
    await sb.from("attendance").update({ status: p.before }).eq("person_id", p.personId).eq("date", p.dateIso);
  }
});

// Document rename — restore the prior title.
registerUndoHandler("ori.document.rename", async (raw) => {
  const p = raw as { documentId: number; before: string };
  await sb.from("documents").update({ title: p.before, updated_at: new Date().toISOString() }).eq("id", p.documentId);
  void reindexEntity("document", p.documentId);
});

// Meeting save (create) — delete the newly-created meeting.
registerUndoHandler("ori.meeting.create", async (raw) => {
  const p = raw as { meetingId: number };
  await sb.from("meetings").delete().eq("id", p.meetingId);
});

// Event edit — restore the event's prior fields.
registerUndoHandler("ori.event.update", async (raw) => {
  const p = raw as { eventId: number; before: Record<string, unknown> };
  await sb.from("calendar_events").update(p.before).eq("id", p.eventId);
});

// Document archive — restore to its prior archived flag.
registerUndoHandler("ori.document.archive", async (raw) => {
  const p = raw as { documentId: number; before: boolean };
  await sb.from("documents").update({ archived: p.before, updated_at: new Date().toISOString() }).eq("id", p.documentId);
  void reindexEntity("document", p.documentId);
});

// Document→task link — drop the link that was just created.
registerUndoHandler("ori.document.link", async (raw) => {
  const p = raw as { documentId: number; taskId: number };
  await sb.from("document_links").delete().eq("document_id", p.documentId).eq("task_id", p.taskId);
});

// Pin toggle — a pin is its own inverse, so re-toggle the same update.
registerUndoHandler("ori.pin.toggle", async (raw) => {
  const p = raw as { updateId: number };
  const { toggleUpdatePin } = await import("@/app/task/actions");
  await toggleUpdatePin(p.updateId);
});

// Announcement publish (Wave C) — take it back off the board. It was a draft
// before, so the inverse is the "not live" state: archive (reversible), unless it
// was somehow already live (leave it published then).
registerUndoHandler("ori.announcement.publish", async (raw) => {
  const p = raw as { announcementId: number; before: string };
  if (p.before === "published") return; // already live before we touched it
  await sb.from("announcements").update({ status: "archived", published_at: null }).eq("id", p.announcementId);
});

// Document trash (Wave C) — restore it from Trash back to the library/quarantine.
registerUndoHandler("ori.document.trash", async (raw) => {
  const p = raw as { documentId: number };
  const { restoreFromTrashAction } = await import("@/app/documents/actions");
  await restoreFromTrashAction(p.documentId);
  void reindexEntity("document", p.documentId);
});

/* ==================================================================== *
 * DOMAIN WAVES — undo handlers for the tools in tools-people.ts,
 * tools-documents.ts, tools-meetings-letters.ts, tools-calendar.ts,
 * tools-governance.ts and tools-ops.ts. Each mirrors the pattern above:
 * a clean inverse of exactly what the tool wrote, reusing an existing
 * action where one exists, else a scoped raw write.
 * ==================================================================== */

const nowIso = () => new Date().toISOString();

/* ---------------------------------- people / HR --------------------- */

// Archive/restore a person — flip the active flag back (cascade side-effects left as-is).
registerUndoHandler("ori.person.active", async (raw) => {
  const p = raw as { personId: number; before: boolean };
  const { setPeopleActive } = await import("@/app/people/actions");
  await setPeopleActive([p.personId], p.before);
  void reindexEntity("person", p.personId);
});

// Snooze — restore the prior snoozed_until value.
registerUndoHandler("ori.person.snooze", async (raw) => {
  const p = raw as { personId: number; before: string | null };
  const { snoozePerson } = await import("@/app/people/actions");
  await snoozePerson(p.personId, p.before);
});

// Primary manager — restore the prior manager_id.
registerUndoHandler("ori.person.manager", async (raw) => {
  const p = raw as { personId: number; before: number | null };
  await sb.from("people").update({ manager_id: p.before }).eq("id", p.personId);
  void reindexEntity("person", p.personId);
});

// Dotted "also reports to" — drop the reporting_lines row that was added.
registerUndoHandler("ori.person.dotted", async (raw) => {
  const p = raw as { personId: number; managerId: number };
  await sb.from("reporting_lines").delete().eq("person_id", p.personId).eq("manager_id", p.managerId);
});

// Portal access/role — restore the prior portal columns.
registerUndoHandler("ori.portal.access", async (raw) => {
  const p = raw as { personId: number; before: Record<string, unknown> };
  await sb.from("people").update(p.before).eq("id", p.personId);
  void reindexEntity("person", p.personId);
});

// Portal role capability toggle — restore the cell to its prior effective value
// (written back as an explicit override, which reproduces the same behaviour).
registerUndoHandler("ori.portal.capability", async (raw) => {
  const p = raw as { role: string; capability: string; before: boolean };
  const { getPortalPermissions, savePortalPermissions } = await import("@/lib/portal-permissions-store");
  const config = await getPortalPermissions();
  const caps = { ...(config.caps ?? {}) };
  caps[p.capability as keyof typeof caps] = {
    ...(config.caps?.[p.capability as keyof typeof caps] ?? {}),
    [p.role]: p.before,
  } as never;
  await savePortalPermissions({ ...config, caps });
});

// Department head — restore the prior head (or clear it).
registerUndoHandler("ori.department.head", async (raw) => {
  const p = raw as { companyId: number; departmentId: number; before: number | null };
  const { setDepartmentHead } = await import("@/app/hrms/org/actions");
  await setDepartmentHead(p.companyId, p.departmentId, p.before);
});

// Request status (decide/advance/cancel) — restore the prior status.
registerUndoHandler("ori.request.status", async (raw) => {
  const p = raw as { requestId: number; before: { status: string } };
  await sb.from("requests").update({ status: p.before.status, updated_at: nowIso() }).eq("id", p.requestId);
});

// Raised request — mark it cancelled (the reversible "withdrawn" state; not hard-deleted).
registerUndoHandler("ori.request.raise", async (raw) => {
  const p = raw as { requestId: number };
  await sb.from("requests").update({ status: "cancelled", updated_at: nowIso() }).eq("id", p.requestId);
});

/* ---------------------------------- documents ----------------------- */

// Document field edit — restore the snapshotted editable columns.
registerUndoHandler("ori.document.update", async (raw) => {
  const p = raw as { documentId: number; before: Record<string, unknown> };
  await sb.from("documents").update({ ...p.before, updated_at: nowIso() }).eq("id", p.documentId);
  void reindexEntity("document", p.documentId);
});

/* ------------------------------ meetings / notes / letters ---------- */

// Meeting delete — re-insert the captured row.
registerUndoHandler("ori.meeting.restore", async (raw) => {
  const p = raw as { row: Record<string, unknown> | null };
  if (!p.row) return;
  await sb.from("meetings").insert(p.row);
  if (typeof p.row.id === "number") void reindexEntity("meeting", p.row.id);
});

// Note create — delete the freshly-created note.
registerUndoHandler("ori.note.delete", async (raw) => {
  const p = raw as { noteId: number };
  await sb.from("meetings").delete().eq("id", p.noteId);
});

// Note edit — restore prior title/body/company/folder.
registerUndoHandler("ori.note.update", async (raw) => {
  const p = raw as { noteId: number; before: { title: string; body: string; companyId: number | null; folder: string | null } };
  await sb
    .from("meetings")
    .update({ title: p.before.title, raw_notes: p.before.body, company_id: p.before.companyId, folder: p.before.folder, updated_at: nowIso() })
    .eq("id", p.noteId);
});

// Note delete — re-insert the captured row.
registerUndoHandler("ori.note.restore", async (raw) => {
  const p = raw as { row: Record<string, unknown> | null };
  if (!p.row) return;
  await sb.from("meetings").insert(p.row);
});

// Note pin toggle — restore the prior pinned state.
registerUndoHandler("ori.note.pin", async (raw) => {
  const p = raw as { noteId: number; before: boolean };
  const { setNotePinned } = await import("@/app/notes/actions");
  await setNotePinned(p.noteId, p.before);
});

// Letter create/duplicate — delete the freshly-created draft.
registerUndoHandler("ori.letter.delete", async (raw) => {
  const p = raw as { letterId: number };
  const { deleteLetterAction } = await import("@/app/letters/actions");
  await deleteLetterAction(p.letterId);
});

// Letter draft save — restore the prior draft fields.
registerUndoHandler("ori.letter.save", async (raw) => {
  const p = raw as { letterId: number; before: Record<string, unknown> | null };
  if (!p.before) return;
  const b = p.before;
  await sb
    .from("letters")
    .update({ title: b.title, subject: b.subject, body: b.body, addressee: b.addressee, company_id: b.company_id, updated_at: nowIso() })
    .eq("id", p.letterId);
});

// Letter delete — re-insert the captured draft row.
registerUndoHandler("ori.letter.restore", async (raw) => {
  const p = raw as { row: Record<string, unknown> | null };
  if (!p.row) return;
  await sb.from("letters").insert(p.row);
});

/* ---------------------------- calendar / announcements -------------- */

// Skipped occurrence — restore it back into the series.
registerUndoHandler("ori.event.skip_occurrence", async (raw) => {
  const p = raw as { eventId: number; dateKey: string };
  const { restoreEventOccurrence } = await import("@/app/calendar/actions");
  await restoreEventOccurrence(p.eventId, p.dateKey);
});

// Restored occurrence — skip it again.
registerUndoHandler("ori.event.restore_occurrence", async (raw) => {
  const p = raw as { eventId: number; dateKey: string };
  const { skipEventOccurrence } = await import("@/app/calendar/actions");
  await skipEventOccurrence(p.eventId, p.dateKey);
});

// Event category create — delete it (its events fall back to uncategorised).
registerUndoHandler("ori.event_category.create", async (raw) => {
  const p = raw as { categoryId: number };
  const { deleteEventCategory } = await import("@/app/calendar/actions");
  await deleteEventCategory(p.categoryId);
});

// Event category rename — restore the prior name.
registerUndoHandler("ori.event_category.rename", async (raw) => {
  const p = raw as { categoryId: number; before: string };
  const { renameEventCategory } = await import("@/app/calendar/actions");
  await renameEventCategory(p.categoryId, p.before);
});

// Announcement archive — restore the prior status.
registerUndoHandler("ori.announcement.archive", async (raw) => {
  const p = raw as { announcementId: number; before: string };
  await sb.from("announcements").update({ status: p.before }).eq("id", p.announcementId);
});

// Announcement create (save-draft) OR hard-delete. Two payload shapes share the
// kind: { announcementId } from save_announcement → delete the fresh draft;
// { announcementId, row } from delete_announcement → re-insert the captured row.
registerUndoHandler("ori.announcement.delete", async (raw) => {
  const p = raw as { announcementId: number; row?: Record<string, unknown> | null };
  if (p.row) {
    await sb.from("announcements").insert(p.row);
    return;
  }
  await sb.from("announcements").delete().eq("id", p.announcementId);
});

/* ------------------------- governance / pipeline / commitments ------ */

// Risk status — restore the prior status.
registerUndoHandler("ori.risk.status", async (raw) => {
  const p = raw as { riskId: number; before: string | null };
  const { setRiskStatusAction } = await import("@/app/governance/actions");
  if (p.before) await setRiskStatusAction(p.riskId, p.before);
});

// Pipeline stage move — restore the prior stage.
registerUndoHandler("ori.pipeline.stage", async (raw) => {
  const p = raw as { itemId: number; before: string | null };
  if (!p.before) return;
  const { movePipelineStageAction } = await import("@/app/hrms/pipeline/actions");
  const { normalizeStage } = await import("@/lib/pipeline-shared");
  await movePipelineStageAction(p.itemId, normalizeStage(p.before));
});

// Pipeline field update — re-apply the snapshotted prior fields.
registerUndoHandler("ori.pipeline.update", async (raw) => {
  const p = raw as { itemId: number; before: Record<string, unknown> };
  const { updatePipelineItemAction } = await import("@/app/hrms/pipeline/actions");
  await updatePipelineItemAction(p.itemId, p.before as never);
});

// Pipeline archive — un-archive.
registerUndoHandler("ori.pipeline.archive", async (raw) => {
  const p = raw as { itemId: number };
  const { archivePipelineItem } = await import("@/lib/pipeline");
  await archivePipelineItem(p.itemId, false);
});

// Pipeline document link — restore the prior linked document (or clear it).
registerUndoHandler("ori.pipeline.link", async (raw) => {
  const p = raw as { itemId: number; before: number | null };
  const { linkPipelineDocumentAction } = await import("@/app/hrms/pipeline/actions");
  await linkPipelineDocumentAction(p.itemId, p.before);
});

// Commitment field update — re-apply the snapshotted prior fields.
registerUndoHandler("ori.commitment.update", async (raw) => {
  const p = raw as { commitmentId: number; before: Record<string, unknown> };
  const { updateCommitmentAction } = await import("@/app/hrms/registers/actions");
  await updateCommitmentAction(p.commitmentId, p.before as never);
});

// Commitment archive — un-archive.
registerUndoHandler("ori.commitment.archive", async (raw) => {
  const p = raw as { commitmentId: number };
  const { archiveCommitment } = await import("@/lib/commitments");
  await archiveCommitment(p.commitmentId, false);
});

// Commitment document link — restore the prior linked document (or clear it).
registerUndoHandler("ori.commitment.link", async (raw) => {
  const p = raw as { commitmentId: number; before: number | null };
  const { linkCommitmentDocumentAction } = await import("@/app/hrms/registers/actions");
  await linkCommitmentDocumentAction(p.commitmentId, p.before);
});

/* ----------------------------- assets / vendors / ops -------------- */

// Asset field edit — restore the snapshotted columns.
registerUndoHandler("ori.asset.update", async (raw) => {
  const p = raw as { assetId: number; before: Record<string, unknown> };
  await sb.from("assets").update(p.before).eq("id", p.assetId);
  void reindexEntity("asset", p.assetId);
});

// Asset status — restore the prior status.
registerUndoHandler("ori.asset.status", async (raw) => {
  const p = raw as { assetId: number; before: string };
  const { setAssetStatusAction } = await import("@/app/hrms/assets/actions");
  await setAssetStatusAction(p.assetId, p.before as never);
});

// Asset archive — un-archive.
registerUndoHandler("ori.asset.archive", async (raw) => {
  const p = raw as { assetId: number };
  const { archiveAssetAction } = await import("@/app/hrms/assets/actions");
  await archiveAssetAction(p.assetId, false);
});

// Vendor field edit — restore the snapshotted columns.
registerUndoHandler("ori.vendor.update", async (raw) => {
  const p = raw as { vendorId: number; before: Record<string, unknown> };
  await sb.from("vendors").update(p.before).eq("id", p.vendorId);
});

// Vendor archive — restore it (vendors are soft-archived via active=false, not an
// `archived` flag). Re-index so its search lifecycle returns to active.
registerUndoHandler("ori.vendor.archive", async (raw) => {
  const p = raw as { vendorId: number };
  await sb.from("vendors").update({ active: true, updated_at: nowIso() }).eq("id", p.vendorId);
  void reindexEntity("vendor", p.vendorId);
});

// Cleaning check — re-apply the prior tick state.
registerUndoHandler("ori.cleaning.check", async (raw) => {
  const p = raw as { dayId: number; areaId: number; before: boolean };
  const { toggleCheckAction } = await import("@/app/hrms/ocr/actions");
  await toggleCheckAction(p.dayId, p.areaId, p.before);
});

// Reference rename (departments / sites / job_titles) — restore the prior name.
registerUndoHandler("ori.ref.rename", async (raw) => {
  const p = raw as { table: "departments" | "sites" | "job_titles"; id: number; before: string };
  await sb.from(p.table).update({ name: p.before }).eq("id", p.id);
});

// Company profile edit — restore the snapshotted columns.
registerUndoHandler("ori.company.profile", async (raw) => {
  const p = raw as { companyId: number; before: Record<string, unknown> };
  await sb.from("companies").update(p.before).eq("id", p.companyId);
  void reindexEntity("company", p.companyId);
});
