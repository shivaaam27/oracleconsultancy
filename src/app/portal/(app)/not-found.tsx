import { StudioOops } from "@/components/studio/oops";

/* Portal 404 — keeps staff inside the portal when a task or page is not theirs. */
export default function PortalNotFound() {
  return (
    <StudioOops
      kind="404"
      title="This isn’t available to you"
      body="The page or task may have moved, or it belongs to someone else’s work."
      home="/portal"
    />
  );
}
