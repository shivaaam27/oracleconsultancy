# Turning on Semantic Search — a plain, click-by-click guide

**Time:** about 10 minutes. **Cost:** free. You only do this once.

You don't need to understand any of it. Just follow the steps exactly, in order.
If anything looks different or an error appears, **take a screenshot and send it to
me (ORI/Claude)** — I'll tell you the next move.

Your project code (you'll need it in Step 4) is:

```
eskboulvmsoqsyuxppaa
```

---

## Step 1 — Open the "terminal"

The terminal is just a black box where you type commands.

1. Open **VS Code** (the app you use to run the project). If you don't use VS Code,
   open the app called **"Terminal"** or **"Command Prompt"** on Windows (press the
   Windows key, type `terminal`, press Enter).
2. In VS Code: click the menu **Terminal** (top of the window) → **New Terminal**.
   A panel opens at the bottom with a blinking cursor. That's it.
3. Make sure it's pointing at the project. If unsure, type this and press Enter:

   ```
   cd C:\Users\User\Documents\cos-system
   ```

You'll type the next commands into this same box, **one at a time**, pressing
**Enter** after each and waiting for it to finish before the next.

---

## Step 2 — Log in to Supabase

Type this and press Enter:

```
npx supabase login
```

- If it asks *"Ok to proceed? (y)"* — type `y` and press Enter.
- Your **web browser** will pop open asking you to authorise. Click **Approve / Allow**.
- Go back to the terminal — it should say something like **"Logged in"** or **"Finished login"**.

✅ Done when you're back at a blinking cursor with no red error.

---

## Step 3 — Get your database password ready

Step 4 will ask for your **database password** (not your website login — the one
you set when the Supabase project was first created).

If you don't remember it, you can reset it:
1. Go to **https://supabase.com/dashboard/project/eskboulvmsoqsyuxppaa/settings/database**
   (log in if asked).
2. Find **"Database password"** → click **"Reset database password"** → copy the new one somewhere safe.

Keep that password on hand for the next step.

---

## Step 4 — Connect to your project

Type this and press Enter:

```
npx supabase link --project-ref eskboulvmsoqsyuxppaa
```

- When it asks for the **database password**, paste it in and press Enter.
  (Note: while typing/pasting a password the box may show **nothing at all** — that's
  normal and for security. Just paste and press Enter.)
- Wait for **"Finished supabase link"**.

✅ Done when you see that message with no red error.

---

## Step 5 — Deploy the search brain

Type this and press Enter:

```
npx supabase functions deploy embed
```

- Wait a minute. You want to see **"Deployed Functions on project …"** or
  **"Deployed Function embed"**.

✅ That's the hard part done.

---

## Step 6 — Switch it on in the app

No terminal here — just the normal website.

1. Open your app and go to **Settings**.
2. Open the **"AI & Voice"** section.
3. Find **"Semantic search"** and switch it **ON**.
4. Click **Save**.

---

## Step 7 — Fill the search index (last step)

Back in the terminal, type this and press Enter:

```
npm run db:embed-backfill
```

- It runs for a few minutes and prints lines as it works through your data.
- When it stops and you're back at a blinking cursor, **it's finished**.

🎉 **All done.** ORI now searches by meaning. Nothing else to do.

---

## If something goes wrong

- **Any red error text** → screenshot it, send it to me, stop there. Don't guess.
- You can't break anything by trying — worst case we just start the step again.
- If you'd rather not finish, that's completely fine: the app keeps working exactly
  as it does now. Semantic search is a bonus, not a requirement.

**Tell me once you've done Step 5 and 6 and I'll run Step 7 for you if you like.**
