import { cn } from "@/lib/cn";

/** Lightweight loading placeholder. Animates with a shimmer. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-bg-muted/70 rounded-lg",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/8 before:to-transparent",
        "before:animate-[shimmer_1.6s_ease-in-out_infinite]",
        className
      )}
    />
  );
}
