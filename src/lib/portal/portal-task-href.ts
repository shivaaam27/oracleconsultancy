/** Where a portal person's task lives (the staff twin of `taskHref`). Pure, so
 *  both server pages and client lists can call it. */
export const portalTaskHref = (code: string) => `/portal/task/${encodeURIComponent(code)}`;
