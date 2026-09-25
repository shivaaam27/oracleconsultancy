"use client";

export const DENSITY_KEY = "cos-density";
const KEY = DENSITY_KEY;

export type Density = "comfortable" | "compact";

export function applyDensity(d: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-density", d);
}

export function DensityScript() {
  // Inline script that runs before hydration to avoid a flash. Compact is the
  // default on the admin side (owner's call, Aug 2026); the staff portal stays
  // Comfortable, being phone-first.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var d=localStorage.getItem('${KEY}')||(location.pathname.indexOf('/portal')===0?'comfortable':'compact');document.documentElement.setAttribute('data-density',d);}catch(e){}`,
      }}
    />
  );
}
