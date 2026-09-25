/**
 * Nothing while /task/new or /task/recurring is on its way. This used to draw
 * the old Desk board skeleton, which is the previous design flashing up on
 * every reload of a Studio page (owner, 25 Sept 2026: "the old system never
 * shows up"). For the fraction of a second it lasts, the Studio frame around
 * an empty page is calmer than a skeleton the wrong shape.
 */
export default function Loading() {
  return null;
}
