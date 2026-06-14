import Link from "next/link";
import { SearchX } from "lucide-react";

/* Admin-side 404 (renders inside the root layout). */
export default function NotFound() {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-muted text-fg-muted ring-1 ring-border">
        <SearchX size={26} />
      </span>
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          That page doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
      >
        Back to home
      </Link>
    </div>
  );
}
