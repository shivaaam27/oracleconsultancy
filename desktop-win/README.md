# Oracle Consultancy — the Windows app

A C# window with Microsoft Edge inside it, pointed at the live COS site.

## Build the file you hand to someone

```
desktop-win\build.cmd
```

Out comes **one file**: `publish\Oracle Consultancy.exe`. Copy it anywhere and
double-click. Nothing to install first, no .NET to download, no setup wizard.

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
| File to share | 99.3 MB installer | **63.3 MB, one file** |
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

## What staff will see the first time

The file is **not signed yet**, so Windows will say:

> **Windows protected your PC** — Microsoft Defender SmartScreen prevented an
> unrecognised app from starting.

They click **More info** → **Run anyway**. Once. That is normal for any unsigned
app and it is why the Microsoft Store is the plan for the real rollout — the
Store signs it and the warning never appears.

Tell people this **before** you send the file. An unexpected security warning is
how a rollout dies.

## Testing it while developing

```powershell
$env:COS_URL = "http://localhost:3000"   # or any preview URL
dotnet run
```

Unset `COS_URL` to go back to production.

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
