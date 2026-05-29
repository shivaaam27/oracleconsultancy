import { redirect } from "next/navigation";

// The Meeting Workspace moved into the unified Workbook (Meetings + Notes).
// Keep this path working for old links and bookmarks.
export default function MeetingRedirect() {
  redirect("/workbook");
}
