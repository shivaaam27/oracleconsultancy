import { SplashController } from "./app-splash-controller";

/* Aurora Dock — the app launch splash.
 *
 * Rendered as the FIRST child of <body> in the root layout, so its markup is in
 * the very first server paint (no white flash, shows before /login and the app).
 * The visuals are pure CSS (globals.css `.aurora-splash`); the only client work
 * is SplashController, which plays the sequence on real motion and removes the
 * overlay from the DOM once web fonts are ready + a minimum beat has elapsed.
 *
 * The "O" mark is the single tracked object: it is the hero, then descends and
 * becomes the floating nav pill's accent lens — so the loader becomes the UI.
 */
export function AppSplash() {
  return (
    <div id="aurora-splash" className="aurora-splash" role="status" aria-label="Loading Oracle Consultancy" aria-live="polite">
      <div className="aurora-splash__stage">
        <div className="aurora-splash__mark">
          <span className="aurora-splash__ring" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-source.png" alt="Oracle Consultancy Limited" width={64} height={64} />
        </div>
        <p className="aurora-splash__name">Oracle Consultancy Limited</p>
      </div>
      <SplashController />
    </div>
  );
}
