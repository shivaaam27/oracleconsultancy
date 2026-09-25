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
/** The old launch splash belongs to the STAFF PORTAL only (managers and
 *  staff, until their turn). On every Studio page — the owner, a director, the
 *  shared sign-in — it put the previous design over the screen for 1.7s on
 *  every reload (owner, 25 Sept 2026: "the old system never shows up"). This
 *  runs in <head>, before the splash is parsed, so it never paints at all. */
/*  Staff's rebuilt pages (26 Sept 2026) are Studio too — the same list as
 *  `isStaffStudioPath` in lib/director-routes.ts, which cannot be imported
 *  into a <head> string. */
export const SPLASH_GATE = `(function(){try{var p=location.pathname;if(p.length>1&&p.charAt(p.length-1)==="/")p=p.slice(0,-1);var portal=p==="/portal"||p.indexOf("/portal/")===0;var studio=["/portal","/portal/tasks","/portal/profile","/portal/people","/portal/companies","/portal/meetings","/portal/announcements"].indexOf(p)>=0||(p.indexOf("/portal/task/")===0&&p!=="/portal/task/new")||p.indexOf("/portal/people/")===0||p.indexOf("/portal/companies/")===0;if(!portal||studio||p.indexOf("/portal/login")===0)document.documentElement.setAttribute("data-no-splash","")}catch(e){}})()`;

export function SplashGateScript() {
  return <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE }} />;
}

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
