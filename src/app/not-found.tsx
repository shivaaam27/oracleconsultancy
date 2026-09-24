import { StudioOops } from "@/components/studio/oops";

/* The 404 for the whole app (Studio look, Sept 2026). */
export default function NotFound() {
  return (
    <StudioOops
      kind="404"
      title="This page isn’t here"
      body="The link may be old, or the page has moved. Everything else is where you left it."
    />
  );
}
