import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Compact Aurora settings card: small icon tile + title + optional one-line
 *  description, then the content. The in-page Settings search matches the title,
 *  the `keywords`, and the description (when it's plain text). */
export function SettingsCard({ id, icon, title, desc, keywords, children, className }: {
  id?: string;
  icon: ReactNode;
  title: string;
  desc?: ReactNode;
  keywords?: string;
  children: ReactNode;
  className?: string;
}) {
  // Fold the description into the search index only when it's a string (some
  // descs are JSX); keeps `data-search` a clean lowercase haystack.
  const descText = typeof desc === "string" ? desc : "";
  return (
    <section
      id={id}
      data-card={id ?? ""}
      data-search={`${title} ${keywords ?? ""} ${descText}`.toLowerCase()}
      className={cn("bg-bg-elev elevated rounded-2xl p-3.5 sm:p-4 scroll-mt-24", className)}
    >
      <div className="flex items-start gap-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          {desc && <p className="mt-0.5 text-[11px] leading-snug text-fg-muted">{desc}</p>}
        </div>
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
