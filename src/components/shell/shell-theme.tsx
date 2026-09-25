/**
 * Tells the Windows app which theme the page is wearing, so the WINDOW can
 * match it. Without this the app ran a black page under a white Windows title
 * bar, which is the one part of the window the website cannot paint.
 *
 * ⚠️ THE SITE MUST NOT DEPEND ON THE SHELL. Everything here is guarded on
 * `window.chrome.webview`, which exists only inside WebView2 — never in a
 * browser and never in the installed PWA. With no shell listening this script
 * attaches one MutationObserver and posts nothing, forever.
 *
 * ⚠️ IT IS AN INLINE <head> SCRIPT ON PURPOSE, like InstallPromptScript beside
 * it. The theme is written onto <html> by next-themes BEFORE React hydrates —
 * a useEffect would report the theme late, so the title bar would flash the
 * wrong colour on every cold start.
 */
const SHELL_THEME_JS = `
(function () {
  try {
    var wv = window.chrome && window.chrome.webview;
    if (!wv) return;
    var last = null;
    function tell() {
      // next-themes is configured attribute="class" (see theme-provider.tsx).
      var dark = document.documentElement.classList.contains("dark");
      var msg = dark ? "theme:dark" : "theme:light";
      if (msg === last) return;
      last = msg;
      wv.postMessage(msg);
    }
    tell();
    new MutationObserver(tell).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  } catch (e) {}
})();
`;

export function ShellThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SHELL_THEME_JS }} />;
}
