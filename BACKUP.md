# Backups & data safety — plain-language guide

You have **two layers** of protection against data loss. Use both.

---

## Layer 1 — Supabase automatic backups (your main safety net)

Supabase runs this for you in the cloud. It is the **primary** way to recover from
a disaster (accidental mass delete, a bad change, corruption). You don't run
anything — but you **must verify it's switched on and know how far back it goes.**

### One-time check (do this now, ~3 minutes)

1. Go to **https://supabase.com** → sign in → open the COS project.
2. Left sidebar → **Database** → **Backups**.
3. Confirm:
   - **Daily backups** are listed (you should see recent dates).
   - Note the **retention** (how many days back you can go). Free plan is limited;
     Pro plan gives daily backups + **Point-in-Time Recovery (PITR)**.
4. If you see **Point-in-Time Recovery**, even better — it lets you restore to any
   minute, not just the last nightly snapshot.

### If backups look thin
- On the **Free** plan, retention is short. For a live business system holding
  payroll, compliance and governance data, the **Pro plan** (with PITR) is strongly
  recommended. This is the single biggest reliability upgrade available and it's a
  billing change, not a code change.

### To restore (disaster recovery)
- Supabase dashboard → **Database → Backups** → pick a backup → **Restore**, or use
  **PITR** to choose an exact time. This rebuilds the whole database cleanly
  (tables, data, relationships). This is the preferred restore path.

---

## Layer 2 — Your own portable backup (belt and braces)

A second copy that **you** own, on your own machine, independent of Supabase. Good
for: keeping an offline copy, reading the raw data, or handing to a developer.

### To take a backup
```
npm run db:backup
```
This creates a timestamped folder under `./backups/`, e.g.
`backups/2026-06-15T12-19-53Z/`, containing:
- `manifest.json` — list of tables, row counts, and when it ran.
- one `<table>.json` file per table (every row).

The `backups/` folder is **git-ignored** — it holds real business data and is never
pushed to GitHub. Keep a copy somewhere safe (e.g. an external drive or a private
cloud folder) for true off-site safety.

### Good habit
Run `npm run db:backup` before any big change (a migration, a bulk import, a mass
edit). It takes seconds and gives you an instant rollback copy.

### To restore from your own backup
```
npm run db:restore -- backups/2026-06-15T12-19-53Z
```
> ⚠️ This OVERWRITES current table contents. It's a recovery tool, not routine.
> For ordinary "go back in time", prefer Supabase PITR (Layer 1) — it's cleaner.
> The portable restore is best-effort and may need a developer's eye if the data
> shape has changed since the backup was taken.

---

## Recommended routine

| When | Do |
|---|---|
| Now (once) | Verify Supabase backups are on; note retention; consider Pro/PITR. |
| Before any migration or bulk edit | `npm run db:backup` |
| Monthly | `npm run db:backup` and copy the folder somewhere off your laptop. |
| Disaster | Restore via Supabase dashboard (PITR if available). Portable backup as fallback. |

---

## Quick test you can do today
Run `npm run db:backup`, open the newest folder under `backups/`, and open
`manifest.json`. If it lists ~77 tables with sensible row counts, your second
safety layer is working. (Verified working on 2026-06-15: 77 tables, 2,584 rows.)
