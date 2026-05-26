import { Skeleton } from "@/components/skeleton";
import { Card } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <Card className="p-0 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none border-b border-border last:border-b-0" />
        ))}
      </Card>
    </div>
  );
}
