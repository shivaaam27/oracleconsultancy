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
 * Where to get it. Leave EMPTY until the installer is actually hosted
 * somewhere — the app then tells people they are out of date without offering a
 * button that goes nowhere. Set it (e.g. to a Supabase Storage link) and the
 * bar grows a Download button on its own; the app needs no change.
 */
// Typed as string, not left to infer "" — an inferred literal type narrows to
// `never` the moment anything checks it, which broke the test that does.
export const DESKTOP_DOWNLOAD_URL: string = "";

/** One short line shown in the bar. Say what changed, in plain words. */
export const DESKTOP_RELEASE_NOTE: string = "";
