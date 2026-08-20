# What's next — the desktop app and COS

Written 20 Aug 2026, after the security pass and the Windows app.
Companion to `memory/desktop_app_and_security_plan.md`.

---

# PART 1 — what the check found

Everything was tested, not assumed.

## Healthy ✅

- **The database is still locked.** 128 tables, no way in with the public key.
- **The headers are live** on production.
- **Almost no CSP violations** — one report in several hours, and it was junk.
  That is a good sign for switching the policy on.
- Build clean, 684 tests pass, type-check clean.

## Fixed in this pass ✅

- **A CSP report we could not read.** The one violation recorded came out as
  "unknown, unknown, unknown" — useless. It now keeps a sample of whatever
  arrived, so the next one can actually be diagnosed.

## Two real gaps found ⚠️

### 1. The app cannot update itself

The *contents* update instantly on every push — that part works. But the
**window itself** has no updater. If the app is changed, everyone keeps the old
copy for ever until they are handed a new installer by hand.

### 2. Notifications do not appear in the app

COS sends reminders as notifications. Inside the desktop app they are **silently
dropped** — WebView2 hands them to the app to display, and the app currently
ignores them. Nothing errors; they just never appear.

⚠️ This matters more than it sounds: staff using the app instead of a browser
would quietly stop getting reminders, and nobody would know why.

## Housekeeping

- A leftover `desktop/` folder that Windows would not delete (stale file handle).
  Delete it after a reboot.
- `VERCEL_TOKEN` in `.env.local` is expired — replace or remove it.

## ⚠️ Still outstanding and still the most important thing

**Rotating the credentials** (to-do #420). The password hashes were public for a
long time. Locking the door does not un-copy them.

---

# PART 2 — the plan, in the order I would do it

## A. Notifications in the app — half a day. Do this first.

The smallest job with the clearest payoff. The app listens for the notification,
and shows it as a normal Windows notification. Clicking it opens the right page.

Without it, the app is *worse* than the browser for anyone relying on reminders.

## B. Updates for the app — one day

**How it would work:** on start-up the app quietly asks COS "what is the newest
version?". If there is one, a small bar appears: *"A new version is ready —
Update"*. One click downloads the new installer and runs it. If the answer never
comes, nothing happens and nobody is interrupted.

**Why this way:** it uses what already exists — the app already talks to COS.
No public repository, no extra service, no certificate.

**Honest alternative: do nothing yet.** The window changes maybe twice a year.
Until it does, "I'll send you a new file" is a real answer. I would still build
it, because the moment there are ten people on it, sending files by hand stops
being a plan.

## C. Offline — decide the size before building

Right now, no internet means a "No connection" screen. Same as the website.

There are two very different jobs here and they should not be confused:

| | What it means | Effort | Risk |
|---|---|---|---|
| **Read-only offline** | Staff can still SEE their tasks, the last version they loaded | ~3 days | Low |
| **Working offline** | Staff can WRITE — post updates, tick things off — and it syncs later | 3–4 weeks | **High** |

**Read-only is worth doing.** Connections here drop, and "I can at least see what
I'm supposed to be doing" is most of the value.

**Working offline I would not do yet**, and I want to be plain about why. COS is
the system of record: the audit trail, task codes and the ledger all assume one
writer. Two people editing the same task offline, then both coming back, is a
whole class of problem — and the wrong answer silently corrupts history rather
than showing an error. It is buildable, but it is a project, not a feature.

**Question I need answered before starting: how often do staff actually lose
their connection?** If it is rare, this is the wrong thing to spend three days
on. If it is daily, read-only offline moves to the top.

Whatever is built here helps the browser AND the app — it is the same service
worker.

## D. Demo accounts — I need to know what problem this solves

There are three different things people mean, and they cost very different
amounts. **I have not assumed which.** See the question at the end.

## E. Finish the security work — one to two days

From the earlier plan, still outstanding:

1. **Rotate credentials** (yours — the most important).
2. **Turn the CSP on** — one setting in Vercel, once a week of quiet has passed.
   It is nearly clean already.
3. **Stronger password hashing** — the current setting is on the weak side, and
   the hashes were public.
4. **Sign-in throttling that works in production** — it currently resets
   constantly, so it barely slows an attacker down.

## F. The rest of the app polish — a day, pick and choose

Small things that make it feel like a real app rather than a website in a box:

- **Minimise to the tray** so it sits out of the way instead of closing.
- **Start with Windows** (optional, off by default).
- **Badge on the taskbar** showing how many tasks need attention.
- **Signing**, eventually — not needed to run (that was settled), but it removes
  the "Windows protected your PC" warning when someone downloads the file.

---

# PART 3 — what I would NOT do, and why

Saying this plainly so it does not get built by accident:

- **The Microsoft Store, for now.** It was the answer when we thought signing was
  required. It is not required. The Store is still nice later — a cleaner
  install and no download warning — but it costs a review round every time the
  window changes, for something that is currently working.
- **A Mac version**, unless someone actually has a Mac. The website already works
  there, and can be installed from the browser.
- **Working offline** (above) until there is a real, repeated need.
- **Buying a code-signing certificate** to fix a problem that turned out not to
  exist.

---

# PART 4 — the one question I need answered

**Demo accounts — which of these do you actually want?**

1. **Show COS to an outsider** (a client, a partner, a new director) without
   showing real company data. → A separate demo company with invented records,
   and a login that can only see it. ~3 days.
2. **Let a new member of staff practise** without breaking anything real.
   → A "training" role that can look but not change. **Cheapest by far** —
   the permissions engine already does read-only roles, so this is closer to
   ~1 day.
3. **A full sandbox for yourself** — a copy of the whole system to try things on
   before doing them for real. → A second deployment and a second database.
   ~1 week, and it needs keeping in step with the real one for ever, which is the
   part that usually rots.

They are not the same job, and building the wrong one is a week wasted.
