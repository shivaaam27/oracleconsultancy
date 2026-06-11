import { Skeleton } from "@/components/skeleton";
import { Panel } from "@/components/surface-kit";

/* Shown instantly on navigation into the portal (incl. straight after sign-in)
 * so staff never see a blank/dark screen while the page renders. Mirrors the
 * portal home shape: hero with four metric tiles, then a few task cards. */
export default function PortalLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Panel className="p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-64" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i} className="p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <span className="grow" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-2.5 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </Panel>
        ))}
      </div>
    </div>
  );
}
