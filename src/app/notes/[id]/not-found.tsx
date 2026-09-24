import { StudioOops } from "@/components/studio/oops";

/**
 * A note that isn't there. The usual reason is that it was deleted or the link
 * is old, so the way out is the shelf, not a dead end.
 */
export default function NoteNotFound() {
  return (
    <StudioOops
      kind="404"
      title="This note isn’t here any more"
      body="It was probably deleted, or this is an old link. Your other notes are exactly where you left them."
      home="/notes"
      homeLabel="All notes"
    />
  );
}
