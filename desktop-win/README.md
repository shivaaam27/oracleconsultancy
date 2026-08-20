# Oracle Consultancy — the Windows app

A C# window with Microsoft Edge inside it, pointed at the live COS site.

## Build the file you hand to someone

```
desktop-win\build.cmd
```

Out comes **one file**: `publish\Oracle Consultancy.exe`. Nothing to install
first, no .NET to download.

**⚠️ But read the Smart App Control section below before sending it to anyone** —
unsigned, Windows refuses to run it at all.

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

## ⚠️ READ THIS FIRST: unsigned builds DO NOT RUN on this machine

Measured on the owner's laptop, 20 Aug 2026. **Windows Smart App Control is ON
and enforced**, and it blocks the unsigned .exe outright:

> Code Integrity determined that a process attempted to load
> `…\Oracle Consultancy.exe` that did not meet the **Enterprise signing level
> requirements**  — CodeIntegrity event 3077, Smart App Control block 3118

Both the portable copy and the properly installed copy were blocked. It is not
about Electron, or C#, or the installer, or where the file sits: **Smart App
Control refuses unsigned executables, full stop.** The app ran once before the
verdict arrived, then stopped running — its cloud check is not instant, so an
early success proves nothing.

Smart App Control is **on by default on new Windows 11 machines**, so staff
laptops will behave the same way.

**Do not "just turn it off."** It can only ever be switched OFF, never back on —
re-enabling needs a Windows reinstall — and switching off a security feature to
install an internal tool is the wrong trade, particularly for an app that holds
the company's records.

So there are exactly three ways to a working desktop app:

| Route | Works under Smart App Control | Cost |
|---|---|---|
| **Install the PWA from Edge** | ✅ yes — no executable exists | free, works today |
| **Microsoft Store (MSIX)** | ✅ yes — Store apps are trusted outright | free; needs Partner Center + review |
| Buy a code-signing certificate | ⚠️ probably, but not guaranteed — Smart App Control weighs reputation as well as signature | $200–400/year |

The packaging in this folder is finished and correct, and is what the Store route
will use. It is simply not usable unsigned.

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
