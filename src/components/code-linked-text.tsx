import Link from "next/link";
import { splitCodeRefs } from "@/lib/timeline";
import { cn } from "@/lib/cn";

/**
 * Renders body text with any COxx-NNN references turned into in-app links.
 * Pure server component so it works inside server-rendered timeline cells.
 */
export function CodeLinkedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segs = splitCodeRefs(text);
  return (
    <span className={className}>
      {segs.map((s, i) =>
        s.isCode ? (
          <Link
            key={i}
            href={`/task/${s.text}`}
            className="font-mono text-[0.92em] text-accent hover:underline"
          >
            {s.text}
          </Link>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </span>
  );
}
