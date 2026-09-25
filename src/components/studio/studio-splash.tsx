"use client";

/**
 * The launch screen for every Studio page (owner, 25 Sept 2026: "improve the
 * loading screen animation"). The Oracle mark on the grey page, and under it a
 * row of seven bars rising in a wave — the Home hero's activity chart in
 * miniature, in its four colours — then "Task Management".
 *
 * It is ONE-SHOT and nearly free:
 *  - it is in the first HTML, so it paints before any script runs;
 *  - it fades in only after 140ms, so a page that arrives quickly never shows it;
 *  - it leaves the moment a Studio page is on screen (`body:has(main .studio)`,
 *    pure CSS, before hydration), or when the app hydrates (`SplashDone`) for a
 *    page not rebuilt yet — and once gone it never comes back on in-app
 *    navigation;
 *  - the staff portal keeps its own splash (SPLASH_GATE in app-splash.tsx), so
 *    this one shows only where that one is switched off (`html[data-no-splash]`).
 * The look lives in globals.css (`.st-splash`).
 */
import { useEffect } from "react";

const BARS = ["#C9CBCF", "#19C37D", "#19C37D", "#F5A524", "#19C37D", "#E0479E", "#C9CBCF"];

export function StudioSplash() {
  return (
    <div className="st-splash" role="status" aria-label="Loading Oracle Task Management">
      <div className="st-splash__stage">
        <span className="st-splash__mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-source.png" alt="" width={34} height={34} />
        </span>
        <span className="st-splash__bars" aria-hidden>
          {BARS.map((c, i) => <i key={i} style={{ background: c, animationDelay: `${i * 90}ms` }} />)}
        </span>
        <span className="st-splash__name">Task Management</span>
      </div>
    </div>
  );
}

/** Marks the app as up, so the launch screen never returns on navigation. */
export function SplashDone() {
  useEffect(() => { document.documentElement.classList.add("st-up"); }, []);
  return null;
}
