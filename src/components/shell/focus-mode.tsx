"use client";

/* Focus mode — a calm view that hides the floating distractions (the AI
 * assistant bubble + the suggestions peek) so the page reads cleanly. Persisted
 * in localStorage and applied as `data-focus` on <html>; the global stylesheet
 * hides anything marked `data-focus-hide`. Mirrors the density script. */

const KEY = "cos-focus";

export function FocusScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var f=localStorage.getItem('${KEY}')==='on';document.documentElement.setAttribute('data-focus',f?'on':'off');}catch(e){}`,
      }}
    />
  );
}
