import { Skeleton } from "@/components/skeleton";
import { Card } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Card className="p-3">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-none border-b border-border last:border-b-0" />
        ))}
      </Card>
    </div>
  );
}
