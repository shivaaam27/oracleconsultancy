# Oracle Consultancy — the Windows app

A window around the live COS site. That is the whole thing.

## Why it is built this way

COS is a **server** application — it renders on Vercel, reads Supabase, calls
Gemini. It cannot become a self-contained `.exe`, and it should not: that would
mean shipping the database keys onto every laptop.

So this shell holds **no keys, no database connection and no copy of the data**.
It has two consequences, both good:

1. **The app updates itself the moment you push.** Push to `master` → Vercel
   builds → the app is new next time it is opened. No installer to reissue,
   nothing for staff to do.
2. **The installer only changes when this folder changes** — the window, the
   menu, the offline screen. That is rare, and `electron-updater` handles it.

## Running it while developing

```bash
cd desktop
npm install
npm run dev     # points the shell at http://localhost:3000
```

`npm start` points it at production instead. Any URL works:

```bash
COS_URL=https://some-preview.vercel.app npm start
```

## Building an installer locally

```bash
cd desktop
npm run build
```

The `.exe` lands in `desktop/dist/`. Nothing is uploaded.

## Releasing (and how updates reach people)

1. Bump `version` in `desktop/package.json`.
2. Tag it: `git tag desktop-v1.0.1 && git push origin desktop-v1.0.1`.
3. GitHub Actions builds the installer and publishes it to a GitHub Release.
4. Every installed app notices within six hours, downloads quietly, and applies
   it the next time the person closes the app.

### ⚠️ The one thing to set up first

`electron-builder.yml` publishes to a repo called **`cos-desktop`**, and that
repo **must be public**. `electron-updater` reads GitHub Releases anonymously —
against a private repo, every laptop would need a GitHub token shipped inside the
app, which is precisely what this design avoids. The shell contains no secrets,
so making it public costs nothing; the only thing it reveals is the COS address,
which staff already know.

Create it once: an empty public repo at `github.com/shivaaam27/cos-desktop`. The
workflow pushes releases to it and nothing else.

**If nothing at all may be public**, swap the `publish` block for:

```yaml
publish:
  provider: generic
  url: https://your-host/cos-desktop/
```

…and upload `latest.yml` plus the `.exe` to that URL on each release. A Supabase
Storage public bucket works. Everything else stays the same.

## Signing

The installer is **unsigned**. Windows shows "Windows protected your PC" on first
download until the file earns a reputation; the person clicks **More info → Run
anyway** once. Auto-updates work unsigned on Windows (macOS is the one that makes
signing mandatory).

To sign later, put the certificate in the GitHub Actions secrets and set the
usual `CSC_LINK` / `CSC_KEY_PASSWORD` env vars in the workflow. Nothing in the
app or in `electron-builder.yml` changes.

Options, cheapest first:

- **Azure Trusted Signing**, ~$10/month — but organisations must be in the US,
  Canada, the EU or the UK. Check whether any group company qualifies before
  budgeting for it.
- **An OV certificate** from a reseller, ~$200–400/year, sold worldwide. The key
  has to live on a hardware token or a cloud HSM.
- **Microsoft Store**, free signing, but it means a Store listing and a review.

## The security model — do not weaken it

`src/main.js` sets these, and they are the reason it is safe to point a native
window at a remote site:

| Setting | Why |
|---|---|
| `nodeIntegration: false` | The page cannot touch Node |
| `contextIsolation: true` | The page cannot reach into the preload's scope |
| `sandbox: true` | The renderer runs in an OS sandbox |
| `webSecurity: true` | Same-origin policy stays on |
| Navigation lock | Anything that is not COS opens in the real browser |
| Permission handler | Denies everything except mic/notifications/location, and only to COS |
| `certificate-error` → reject | A bad certificate can never be clicked through |

`src/preload.js` exposes **one** function — the Retry button on the offline
screen. If a new feature seems to need more, the first question is whether the
website could do it in an ordinary browser instead.
