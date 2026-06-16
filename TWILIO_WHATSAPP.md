# WhatsApp via Twilio — step-by-step setup

Plain-language guide for the owner. This is the **non-Meta-direct** route: you deal with
Twilio, and Twilio handles the connection to WhatsApp (which Meta owns) for you.

There are **two stages**:

- **Stage 1 — Sandbox (test):** send real WhatsApp messages in ~15 minutes, no verification, no cost worth worrying about. Use this to *prove it works*.
- **Stage 2 — Go live:** business verification + approved message templates + a real Twilio WhatsApp number. Do this only once you're happy with the test.

You can stop after Stage 1 for as long as you like.

---

## Before you start

- A mobile with **WhatsApp installed** (for testing).
- A **credit/debit card** (Twilio asks for one even on the free trial; the trial gives you free credit to test with).
- About **15 minutes** for Stage 1.

---

## STAGE 1 — Sandbox (test it works)

### Step 1 — Create a Twilio account
1. Go to **https://www.twilio.com/try-twilio**.
2. Sign up with your email (use **admin@oracle.co.tz** or any address you check).
3. Verify your email and your phone number when asked.
4. When it asks what you want to do, you can pick anything (e.g. "WhatsApp", "Alerts & Notifications"). It doesn't lock you in.

### Step 2 — Find your account keys
1. Once logged in, you land on the **Twilio Console** (dashboard).
2. On the main dashboard you'll see **Account SID** and **Auth Token**.
   - **Account SID** starts with `AC...`
   - **Auth Token** is hidden — click **"Show"** to reveal it.
3. **Copy both somewhere safe.** I'll need these to wire it up (treat the Auth Token like a password — don't email it around).

### Step 3 — Turn on the WhatsApp Sandbox
1. In the left menu, go to **Messaging → Try it out → Send a WhatsApp message**.
   (If you can't find it, search "WhatsApp sandbox" in the console search bar.)
2. You'll see a **Twilio sandbox number** (something like `+1 415 523 8886`) and a **join code** (two words, e.g. `join happy-tiger`).
3. On **your phone**, open WhatsApp and **send that join code** as a message **to the sandbox number**.
   - e.g. text `join happy-tiger` to `+1 415 523 8886`.
4. WhatsApp replies confirming you've joined the sandbox. Your number is now allowed to receive test messages.

> Note: in the sandbox, **only numbers that have sent the join code** can receive messages. That's fine for testing — add your own number and one or two colleagues.

### Step 4 — Tell me you're ready
Send me:
- your **Account SID** (`AC...`),
- your **Auth Token**,
- the **sandbox number** (e.g. `+14155238886`).

I'll put these into the system's settings and switch the WhatsApp engine over to Twilio.
Then we send a test message from the system to your phone and confirm it lands. ✅

---

## STAGE 2 — Go live (only when the test is good)

This is where Meta's rules kick in. Twilio walks you through it, but Meta still has to approve.

### Step 5 — Verify your business with Meta (via Twilio)
1. In the Twilio Console, go to **Messaging → Senders → WhatsApp senders** and start the
   **"Register a WhatsApp sender"** flow.
2. You'll connect/create a **Meta Business account** and verify Oracle Consultancy
   (business name, website, and sometimes a document). Twilio guides each step.
3. You'll pick the **phone number** that will be your WhatsApp Business number.
   - It must be a number **not already on a personal WhatsApp**, OR one you're willing to migrate.
   - Many businesses buy a fresh number from Twilio for this.

> This step can take anywhere from a few hours to a few days, depending on Meta's review.

### Step 6 — Get message templates approved
For any message you send to someone **first** (a reminder, an overdue chase, the brief),
Meta requires **pre-approved wording** called a *template*.

1. In Twilio, go to **Messaging → Content Template Builder**.
2. Create a template for each kind of message you want to send automatically. Examples:
   - **Reminder:** "Hello {{1}}, this is a reminder that {{2}} is due on {{3}}."
   - **Overdue chase:** "Hello {{1}}, task {{2}} is now overdue. Please update when you can."
   - **Director brief:** a short "Your weekly brief is ready" line.
3. Submit each for approval. Meta usually responds within a few hours to a day.

> The `{{1}} {{2}}` bits are blanks the system fills in (name, task, date). You write the
> fixed wording once; the system slots in the details each time.

### Step 7 — Switch to live credentials
Once you have an approved sender number and templates:
1. Send me the **live WhatsApp number** and the **approved template names/IDs**.
2. I swap the sandbox settings for the live ones, and point the reminders/chases at the
   approved templates.
3. We send one live test, confirm, and you're in production.

---

## What it costs (rough)

- **Twilio trial:** free credit to test — Stage 1 effectively free.
- **Live:** a small **Twilio fee + Meta's WhatsApp fee per message** — typically a few US cents
  each (varies by country). For a single operator's reminders, this is pennies a day.
- No monthly platform fee for the basic setup; you pay per message.

---

## The honest summary

- **Stage 1 proves it works** with almost no friction. Do this first.
- **Stage 2 is the real paperwork** — and that paperwork (business verification + templates)
  is **Meta's**, not Twilio's, so it's unavoidable on any route that sends WhatsApp automatically.
- The code side is small on both stages — `lib/whatsapp.ts` is already shaped for it; I just
  point it at Twilio and add your credentials.

---

## Where this plugs into the system

- **Settings → Messaging** shows WhatsApp status.
- **Outbox** and the **director "Send a message"** composer can send via WhatsApp.
- Automated **reminders / overdue chases** (the email-automation rules) can add a WhatsApp channel.
- The existing **`wa.me` click-to-send links** stay as a free manual fallback regardless.
