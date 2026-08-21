import { PageHeader } from "@/components/ui";
import { OfflineNoteWriter } from "@/components/offline-note-writer";

/* The one page that works with no connection.
 *
 * ⚠️ IT MUST STAY FREE OF SERVER DATA. The service worker keeps a copy so it can
 * be opened when nothing else can be, and a cached page that carried real
 * records would be a cached copy of the owner's records sitting on the device.
 * What is cached here is an empty sheet of paper: everything written lives in
 * this device's own store, never in the cached HTML.
 *
 * So: no `await` on anything, no props from the server, nothing from `sb`. If
 * this page ever needs data, it stops being safe to cache and offline writing
 * stops working. */
export const metadata = { title: "Write offline — Oracle Consultancy" };

export default function OfflineNotePage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Write offline"
        sub="Catch a thought now; it reaches COS when the connection does."
      />
      <div className="mt-5">
        <OfflineNoteWriter />
      </div>
    </div>
  );
}
