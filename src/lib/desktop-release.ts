/* ------------------------------------------------------------------ *
 * What the Windows app should be running.
 *
 * The desktop app asks COS "what is the newest window?" when it starts, and
 * shows a bar if the copy on that machine is older. This is the answer.
 *
 * ⚠️ WHY A CONSTANT AND NOT A SETTING: bumping this and rebuilding the app are
 * the SAME event, so they belong in the same commit. A settings row could be
 * changed without a matching build, which would tell everyone they are out of
 * date and give them nothing newer to install.
 *
 * ⚠️ THIS MUST MATCH <Version> IN desktop-win/OracleConsultancy.csproj.
 * There is a test that fails if they drift (desktop-release.test.ts), because
 * the failure mode is otherwise silent: every app in the company shows an
 * out-of-date bar for a version that does not exist.
 * ------------------------------------------------------------------ */

/** The newest published version of the desktop window. */
export const DESKTOP_VERSION: string = "1.0.2";

/**
 * The installer's name inside the private `desktop` storage bucket.
 *
 * ⚠️ A PATH, NOT A URL, and the bucket stays PRIVATE. The version endpoint mints
 * a short-lived signed link each time it is asked. A public bucket would be
 * simpler and would also mean a permanent address anyone could hand around for
 * ever — and it would trip `npm run db:check-security`, which refuses public
 * buckets on purpose.
 *
 * Leave EMPTY until an installer is actually uploaded: the app then says you are
 * out of date without offering a button that goes nowhere.
 *
 * Typed as string, not left to infer "" — an inferred literal type narrows to
 * `never` the moment anything checks it, which broke the test that does.
 */
export const DESKTOP_STORAGE_PATH: string = "Oracle-Consultancy-Setup-1.0.2.exe";

/** The bucket holding it. Private; see above. */
export const DESKTOP_BUCKET = "desktop";

/**
 * SHA-256 of the installer at DESKTOP_STORAGE_PATH, lower-case hex.
 *
 * ⚠️ THIS IS A SECURITY CONTROL, NOT A NICETY. The app downloads this file and
 * RUNS it. Without a checksum, anything that could alter the download — a
 * tampered URL, a broken upload, a hostile network — would be executed on every
 * staff machine. The app refuses to run a file whose hash does not match, and
 * refuses to run anything at all when this is empty.
 *
 * Produced by `npm run desktop:hash` after building the installer.
 */
export const DESKTOP_SHA256: string = "2a2738949cbf3d160d6edf6335715cd17c6757796613ed98ba0b3caa6b2b2a34";

/**
 * One short line shown in the update BAR, where there is room for a sentence.
 *
 * ⚠️ KEEP THIS. Version 1.0.1 reads `note` and knows nothing of `notes` below;
 * dropping it would leave every 1.0.1 app with a bar that says only "a newer
 * version is available" and nothing about what changed. Old apps are exactly
 * the ones that most need telling.
 */
export const DESKTOP_RELEASE_NOTE: string = "A version panel on the tray icon, a dark-mode update bar, download progress, and the app reopens where you left off.";

/** The day this version was published, ISO. Shown in the version panel. */
export const DESKTOP_RELEASED_ON: string = "2026-08-25";

/**
 * What actually changed, one line each, for the version panel (1.0.2+).
 * Plain words — this is read by whoever is deciding whether to press the button.
 */
export const DESKTOP_NOTES: string[] = [
  "Right-click the tray icon for a version panel, with a Check for updates button.",
  "The update bar follows dark mode instead of glaring amber.",
  "Downloading an update shows how far along it is.",
  "The app reopens on the page you were last on.",
  "Zoom (Ctrl +/-) is remembered between launches; Ctrl+0 resets it.",
];
