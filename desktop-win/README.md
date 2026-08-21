# Oracle Consultancy — the Windows app

A C# window with Microsoft Edge inside it, pointed at the live COS site.

## Build the file you hand to someone

```
desktop-win\build.cmd
```

Out comes `publish-folder\`, which runs as-is. To hand someone **one file**:

```
desktop-win\build-installer.cmd
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

## Releasing a new version of the window

The CONTENTS update on every push and need nothing. Only this folder is frozen
at whatever someone installed.

When you change the window:

1. Bump `<Version>` in `OracleConsultancy.csproj`.
2. Bump `DESKTOP_VERSION` in `src/lib/desktop-release.ts` to the same number.
   **A test fails if they disagree** — the failure is otherwise silent and
   company-wide: every app shows an out-of-date bar for a version nobody built.
3. `build-installer.cmd`, and send the file.

Every running app then shows a bar on its next start: *"A newer version of this
app is available (1.0.1). You have 1.0.0."*

### Turning the bar into a one-click update

The app can download and install the new version itself. To switch that on:

4. Host `Oracle Consultancy Setup.exe` somewhere reachable over **https**.
5. `npm run desktop:hash` → paste the result into `DESKTOP_SHA256`.
6. Put the link in `DESKTOP_DOWNLOAD_URL`.

A **Download** button then appears in the bar by itself — **already-installed
apps need no change**.

⚠️ **THE CHECKSUM IS NOT OPTIONAL.** This is the one place the app downloads a
file and RUNS it, which is the most dangerous thing it does. Three rules:

1. **https only** — checked before the request is made.
2. **The SHA-256 must match.** A file that does not match is deleted and never
   run. This is what stops a tampered download, a corrupt transfer or a hostile
   network turning into code running on every machine in the company.
3. **No checksum, no button.** COS refuses to advertise a download it cannot
   vouch for, so the button does not appear at all.

Verified both ways: a deliberately wrong checksum produced *"That download did
not arrive intact, so it was not installed"*, the file was deleted and the app
kept running; the correct checksum passed the check and went on to launch.

⚠️ **Where to host it is still open.** Supabase Storage was tried and **rejected
the 53.5 MB file** (project size cap) after a five-minute upload. Options: a
public GitHub release (no size limit, but the installer becomes publicly
downloadable — it holds no secrets), or shrinking the installer by shipping the
framework-dependent build and letting the installer fetch the .NET runtime.

⚠️ Every failure in the check is silent on purpose: no internet, no answer, a
bad answer, or a COS old enough not to have the endpoint all mean "say nothing".
Verified all three: older app shows the bar, current app shows nothing, and a
server without the endpoint is ignored.

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
