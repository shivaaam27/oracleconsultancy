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
export const DESKTOP_VERSION: string = "1.0.0";

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
export const DESKTOP_STORAGE_PATH: string = "Oracle-Consultancy-Setup-1.0.0.exe";

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
export const DESKTOP_SHA256: string = "71283cb45ebc3bcf41d54da91e997363f30b0ee2979bfed6cba87850c3bfa72a";

/** One short line shown in the bar. Say what changed, in plain words. */
export const DESKTOP_RELEASE_NOTE: string = "";
