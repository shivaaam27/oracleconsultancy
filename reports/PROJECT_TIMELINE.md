# How this system was built

*Oracle Consultancy — Chief-of-Staff command centre. Prepared 28 July 2026.*

A plain-English account of where this project started, what was built each month,
and where it stands today. Dates and figures are taken from the project's own
build history — **1,024 recorded changes** between 25 May and 28 July 2026.

---

## The short version

| | |
|---|---|
| Started | **25 May 2026** |
| Time in development | **9 weeks** |
| Recorded changes | **1,024** |
| Companies managed | **6 active** (of 13 on file) |
| People on the system | **43** |
| Tasks handled | **87** |
| Documents filed | **1,001** |
| What it replaced | An Excel workbook |

---

## Where it started

Before this, the whole portfolio ran on **a single Excel workbook**. Tasks,
follow-ups and compliance dates lived in spreadsheet rows, and everything was
chased manually by one person across seven companies.

The system was started on **25 May 2026** to replace that workbook — initially just
task capture and tracking, for one operator.

---

## Month one — May: the foundation

*237 changes in the first week alone.*

The core came together fast: task capture, a per-task timeline so nothing was lost,
an escalation board, and a weekly digest. Within days it also gained the things that
made it more than a list:

- **Smart Capture** — type or paste rough notes and it works out the task
- **Ask COS** — ask the system questions in plain language
- **Voice input** — speak instead of typing
- **Undo on everything** — so a mistake was never permanent
- **Calendar** with drag-to-reschedule

By the end of May the Excel workbook had effectively been replaced.

## Month two — June: from task list to operating system

June was the biggest month by far (**621 changes**), and it changed what the system
*was*. It stopped being a task tracker and became the place the business runs.

**Documents became intelligent.** The system began reading uploaded PDFs and photos
by itself — pulling out the company, the document type and the expiry date, then
filing it and watching the renewal date.

**Other people got access.** On **10 June** the staff portal launched — every person
their own login, seeing only their own work. This is the point the system stopped
being a one-person tool.

**HR and admin moved in.** Stock control (OECR), cleaning rota (OCR), assets and
vendors, people records with full audit history, attendance, and recurring statutory
obligations that spawn their own tasks when due.

**Security matured.** Face ID and fingerprint sign-in arrived on 13 June.

**Communication came in-house.** Announcements (15 June), then chat, so conversations
sat next to the work instead of in WhatsApp.

**Dropbox connected** (19 June) — files dropped in a folder flow into the system.

## Month three — July: intelligence, then discipline

July split into two halves.

**The first half added the brain.** The ORI cloud agent arrived on 1 July — a
background worker that reads documents, answers questions from what it finds, and
works around the clock. Search became conversational: ask "who handles our permits"
and it understands. The staff portal reached near-parity with the owner's own screen,
so directors and managers could genuinely run their own work.

**The second half took things away.** After two months of rapid building, the honest
assessment was that too much had been built. So late July was spent removing:

- Six unused areas retired (Workbook, Organogram, Letters, Requests, staff data form,
  and the Leave module) — **no data deleted**, the screens simply removed
- A security patch closing nine issues, including one that could have bypassed the
  login screen
- The document intake given a proper confidence ladder: documents whose company is
  proved by a hard signal now file themselves, and only genuine ambiguity waits for a
  person — with the reason stated plainly
- A written rulebook (`DOCUMENTS.md`) so the filing rules can be checked without
  reading code

---

## Where it stands today

**A task-management command centre** for six active companies and 43 people, with:

- **Task management** — capture, ownership, deadlines, escalation, per-task history,
  and a full portfolio activity feed
- **A staff portal** — every person signs in and manages their own work; directors and
  managers get a board scoped to their companies
- **Document intelligence** — reads, names, files and watches expiry dates, and now
  files confidently-identified documents on its own
- **Compliance tracking** — per-person and per-company checklists that score themselves
- **Attendance** — a register the owner paints, plus staff self-check-in
- **AI throughout** — Ask ORI, voice, search by meaning, and a background agent
- **Chat, announcements and calendar** — with events able to spawn tasks

**Honest position:** the building phase is over and the useful-and-used phase has
begun. The last month has been about trusting less, verifying more, and taking out
what wasn't earning its place.

---

## What the numbers say about usage

- **87 tasks** raised across six companies, **49 finished**
- **130 written progress notes** — and **25 of those came from staff and directors**,
  not the owner. The portal is genuinely being used, not just issued
- **10 tasks were raised by other people** through their own logins
- **1,001 documents** filed
- Peak build weeks: **late May** (237 changes) and **mid-June** (257 changes)

---

## Worth knowing

**Nothing has ever been deleted.** Every feature retirement kept its data; every
document removal keeps a backup. That was a deliberate choice throughout.

**The system was built conversationally.** There was no engineering team — it was
built by describing what was needed in plain language and reviewing the result. The
project's own task **OC-019 ("COS / HR system development")** records this from the
inside.
