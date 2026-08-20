# Oracle Consultancy — the Windows app

A C# window with Microsoft Edge inside it, pointed at the live COS site.

## Build the file you hand to someone

```
desktop-win\build.cmd
```

Out comes `publish-folder\`, which runs as-is. To hand someone **one file**:

```
desktop-winuild-installer.cmd
```

→ `installer\out\Oracle Consultancy Setup.exe` (53 MB). Per-user install, no
admin rights, Start-menu and desktop shortcuts, clean uninstall. **Verified
working unsigned under Smart App Control.**

## Why it is built this way

COS is a **server** application — it renders on Vercel, reads Supabase, calls
Gemini. It cannot become a self-contained `.exe`, and it must not: that would
mean shipping the database keys onto every laptop.

So this app holds **no keys, no database connection and no copy of the data**.
Two consequences, both good:

1. **It updates itself the moment you push.** Push to `master` → Vercel builds →
   the app is new next time someone opens it. Nothing to re-send.
2. **The `.exe` only changes when this folder changes** — the window, the offline
   screen. That is rare.

## The numbers, measured on this machine

Not estimates — measured, because the first version of this document guessed and
guessed wrong.

| | Electron (removed) | This app |
|---|---|---|
| File to share | 99.3 MB installer | **53.5 MB installer** |
| Memory, live page open | 499 MB | ~592 MB |
| Browser engine | ships its own Chromium | uses the Edge already on Windows |

**⚠️ It does NOT use less memory.** WebView2 *is* Chromium, so a loaded page
costs about what Chromium costs anywhere. Anyone who tells you a WebView2 app is
lighter on RAM than Electron is repeating a claim about disk size. The honest
wins are:

- **A smaller file to send** — 63 MB instead of 99 MB.
- **The engine is patched by Windows Update.** Electron's Chromium only gets
  security fixes when we build and re-send an installer; WebView2 is Edge, and
  Edge updates itself. For an app behind a login, that matters.
- **The Microsoft Store route.** A C# app packages as MSIX, and the Store signs
  it for free — no certificate to buy. That is the plan once internal testing is
  done.

If .NET 8 is ever installed everywhere, the same project builds to **2.2 MB**
(`--self-contained false`). Not worth the extra install step today.

## ⚠️ READ THIS FIRST: never build it as a single file

Windows **Smart App Control is ON and enforced** on the owner's machine, and it
blocks a `PublishSingleFile` build outright:

> Code Integrity determined that a process attempted to load
> `…\Oracle Consultancy.exe` that did not meet the **Enterprise signing level
> requirements** — CodeIntegrity 3077, Smart App Control block 3118

**It is not about signing.** Measured on 20 Aug 2026, all unsigned:

| Build | Result |
|---|---|
| Single file, self-contained, compressed (63 MB) | ❌ **blocked**, portable and installed alike |
| Self-contained, ordinary files (247 files, 145 MB) | ✅ runs |
| Framework-dependent, ordinary files (9 files, 1.4 MB) | ✅ runs |
| Installed from the MSI/bootstrapper as a folder | ✅ runs |

The proof was sitting on the same machine: **the original ORI shell is also
unsigned C# + WebView2 and has always run fine** — 0.19 MB with 13 files beside
it. The only difference was the packing.

A single-file .NET build is a compressed, self-extracting executable, which is
exactly the shape of a malware dropper. Smart App Control refuses it. Ordinary
files are ordinary files.

**So: never add `-p:PublishSingleFile=true`, and never "tidy" the installer into
shipping one file.** The installer gives you the single file to SHARE; what it
lays down on disk must stay a folder.

Signing is therefore **not needed** to distribute this internally. It is still
worth having eventually — it removes the SmartScreen download warning — but it is
not what stands between you and a working app.

## Testing it while developing

```powershell
$env:COS_URL = "http://localhost:3000"   # or any preview URL
dotnet run
```

Unset `COS_URL` to go back to production.

## Notifications — what works and what does not

Measured on 20 Aug 2026, not assumed.

**WebView2 does not display a web notification by itself.** It hands it to the
app and expects the app to show it. Before this was handled, COS raised
notifications inside the app and **nothing appeared** — no error, no warning,
just silence.

| Kind | Raised by | Reaches the app? | Shown now? |
|---|---|---|---|
| Non-persistent | `new Notification()` from the page | ✅ yes, `NotificationReceived` | ✅ yes, as a Windows notification |
| **Persistent** | `registration.showNotification()` — **how a pushed reminder arrives** | ❌ no event in this SDK | ❌ no |

⚠️ **So do not promise that a pushed task reminder pops up as a Windows toast in
the app.** It does still appear inside COS itself — the bell, and the
Task-reminders channel — which is where people are actually looking. Push itself
works fine in WebView2: `PushManager`, the service worker, `showNotification` and
reading the subscription are all supported. It is only the *display* handover
that stops at the persistent kind.

⚠️ **Read every property off the notification BEFORE touching any UI.** The
object is valid only for the duration of the event. Creating the tray icon pumps
the Windows message loop, the event scope ends, and the next property read throws
*"CoreWebView2Notification members cannot be accessed after the WebView2 control
is disposed"* — a confusing way of saying "too late". The order of those lines in
`OnNotificationReceived` is deliberate.

## The security model — do not weaken it

This window shows **remote code**, so these rules are what keep it an app rather
than an uncontrolled browser. They live in `MainWindow.xaml.cs`.

| Rule | Why |
|---|---|
| Origin check on **scheme + host + port** | A `StartsWith` would let `oracleconsultancy.vercel.app.evil.com` through |
| External `http(s)` → the real browser | A stray link cannot turn this into a browser |
| `NewWindowRequested` → the real browser | No second chrome-less window |
| Permissions denied by default | Only mic, camera, notifications, location — and only to COS |
| `OpenExternally` refuses non-http(s) | A page cannot ask Windows to open a `file:` path |
| Web messages: only `retry` is honoured | The site is an ordinary website and must never depend on this shell |

## Two bugs that cost real time — do not reintroduce them

1. **`App.xaml` needs `StartupUri`.** Without it WPF starts, creates no window,
   and sits there invisible. The process runs, nothing appears, and nothing
   errors. Symptom: the app "launches" but `MainWindowTitle` is empty.

2. **The navigation lock cancelled the app's own offline screen.** The first
   version cancelled any navigation that was not the COS origin —
   and `NavigateToString` loads through a `data:` URI, so the offline page was
   being "sent to the browser". The user saw Chromium's error page instead.
   Only **external http(s)** is redirected; `about:`, `data:` and `blob:` are the
   app talking to itself.

Both were found by launching the built `.exe` and reading the window title. Do
that after any change here — it is the only check that catches this class of
bug.

## Later: the Microsoft Store

When internal testing is done, package as MSIX and publish to the Microsoft Store
restricted to the organisation in Partner Center. Microsoft signs it (free since
May 2026, for companies as well as individuals), the SmartScreen warning
disappears, and the Store handles shell updates. The app code does not change.
