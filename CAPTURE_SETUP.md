# Capture Setup — getting things into COS

The COS Inbox receives forwarded emails and shared messages through one secure
web address: `POST /api/inbox`, protected by the `INBOX_SECRET`. Each "bridge"
below just sends content to that address. Items then appear on the **Inbox**
page; tapping **File it** opens the Capture Wizard to turn them into a task or
a note.

- **Production endpoint:** `https://oracleconsultancy.vercel.app/api/inbox`
- **Auth:** header `Authorization: Bearer <INBOX_SECRET>` (or `?token=<INBOX_SECRET>`)

> ⚠️ Before any bridge works in production, `INBOX_SECRET` must be set in the
> host's environment variables and the site re-deployed. See `DEPLOYMENT.md`.

---

## WhatsApp / Share → COS (iPhone, via Apple Shortcut)

Apple doesn't let an installed web app appear in the iPhone share sheet, so we
use a free **Shortcut** instead. Build it once; afterwards it appears whenever
you tap Share.

### Build the Shortcut

1. Open the **Shortcuts** app → tap **+** (new shortcut).
2. Tap the name at the top → rename to **Save to COS**.
3. Tap the **ⓘ** (info) button → turn on **Show in Share Sheet**. Under
   *Share Sheet Types*, keep **Text** ticked (you can add Images/Files later).
4. Add an action: search for **Get Contents of URL** and tap it.
5. In that action:
   - **URL:** `https://oracleconsultancy.vercel.app/api/inbox`
   - Tap **Show More** to reveal the options.
   - **Method:** `POST`
   - **Headers:** tap *Add header* →
     - Key: `Authorization`
     - Value: `Bearer <INBOX_SECRET>`  *(paste your real secret after the word `Bearer ` and a space)*
   - **Request Body:** choose **JSON**, then add two fields:
     - Field `source` (Text) = `whatsapp`
     - Field `body` (Text) = the **Shortcut Input** variable
       *(tap the field, then pick the magic variable "Shortcut Input")*
6. *(Optional but nice)* Add a final action **Show Notification** with text
   `Saved to COS` so you get instant confirmation.
7. Tap **Done**.

### Use it

1. In WhatsApp, **select one or more messages** → tap **Share / Forward → Share**.
2. In the share sheet, scroll to **Save to COS** and tap it.
3. COS receives it and sends you a push: **"New item to file."**
4. Tap the push (or open COS → **Inbox**) → **File it** → it's pre-filled in the
   Capture Wizard, ready to become a task or note.

### What works today
- **Text / messages:** fully supported. Multiple selected messages arrive as one
  block of text — COS reads them all and strips WhatsApp's `[time, date] Name:`
  prefixes automatically.
- **Photos / documents:** not yet. They need file storage, which arrives with the
  Document-Intelligence feature. For now, use this for text.

### Notes
- The secret is stored inside the Shortcut on your phone — fine for a single
  operator. Don't share the Shortcut with the secret embedded.
- No app login is required; the secret is what authorises the post.

---

## Email → COS

_(To be added — Gmail + free Apps Script bridge.)_
