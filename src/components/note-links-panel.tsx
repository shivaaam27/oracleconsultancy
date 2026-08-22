import Link from "next/link";
import { AtSign, Building2, CornerUpLeft, FileText, ListChecks, StickyNote, User } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LinkType, ResolvedLink } from "@/lib/note-links-shared";
import type { Backlink } from "@/lib/note-links";

/**
 * What this note points at, and what points back at it. Phase 3 of the notes plan.
 *
 * A plain server component — it is given resolved rows and draws them, so there is
 * no client bundle and no `sb` import anywhere near a browser.
 *
 * Two deliberate calls:
 *  • **The labels are the LIVE ones**, re-read from each target's own table by
 *    `resolveLinks()`, not the snapshot stored in the document. So a renamed
 *    company shows its new name here while the sentence that mentions it keeps
 *    the words that were written. Text and index, each right in its own place.
 *  • **A dead link is shown, not hidden.** A target that has been deleted renders
 *    struck through and greyed: "this pointed at something that is gone" is
 *    information, and quietly dropping the row would hide it.
 */

const ICONS: Record<LinkType, React.ComponentType<{ size?: number; className?: string }>> = {
  task: ListChecks,
  person: User,
  company: Building2,
  document: FileText,
  note: StickyNote,
};

export function NoteLinksPanel({ links, incoming }: { links: ResolvedLink[]; incoming: Backlink[] }) {
  const empty = links.length === 0 && incoming.length === 0;

  return (
    /* No width here — the page's rail column owns it, so this sits happily
       beneath the To-dos panel rather than fighting it for the same rule. */
    <aside className="flex w-full flex-col gap-2.5">
      <Section
        title="Links"
        icon={<AtSign size={12} />}
        count={links.length}
        /* The empty state is the discovery path for `@` — the only place in the
           product that says what the gesture is, at the moment you are looking for
           somewhere to put one. */
        empty="Nothing linked yet. Type @ in the note to link a task, person, company or document — or [[ for another note."
      >
        {links.map((l) => {
          const Icon = ICONS[l.entity];
          return (
            <Row
              key={`${l.entity}:${l.id}`}
              href={l.href}
              icon={<Icon size={12} className="text-fg-subtle" />}
              label={l.label}
              sublabel={l.sublabel}
              code={l.code}
              missing={l.missing}
            />
          );
        })}
      </Section>

      <Section
        title="Backlinks"
        icon={<CornerUpLeft size={12} />}
        count={incoming.length}
        empty="No other note links here yet."
      >
        {incoming.map((b) => (
          <Row
            key={b.noteId}
            href={b.href}
            icon={<StickyNote size={12} className="text-fg-subtle" />}
            label={b.title}
            sublabel={b.snippet || undefined}
            muted={b.archived}
            badge={b.archived ? "Archived" : undefined}
          />
        ))}
      </Section>

      {empty && (
        <p className="px-1 text-xs leading-relaxed text-fg-subtle">
          Links are made by writing, not by filing — mention something in the note and it appears here.
        </p>
      )}
    </aside>
  );
}

function Section({
  title, icon, count, empty, children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <header className="flex items-center gap-1.5 border-b border-border bg-bg-subtle/60 px-2.5 py-1.5">
        <span className="text-fg-subtle">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">{title}</h2>
        {count > 0 && <span className="ml-auto text-xs tabular text-fg-subtle">{count}</span>}
      </header>
      {count === 0 ? (
        <p className="px-2.5 py-2.5 text-xs leading-relaxed text-fg-subtle">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </section>
  );
}

function Row({
  href, icon, label, sublabel, code, missing, muted, badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  code?: string | null;
  missing?: boolean;
  muted?: boolean;
  badge?: string;
}) {
  const body = (
    <span className="flex min-w-0 items-start gap-2 px-2.5 py-1.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {code && <span className="shrink-0 font-mono text-xs text-fg-subtle">{code}</span>}
          <span className={cn("truncate text-sm font-medium", missing ? "text-fg-subtle line-through" : muted ? "text-fg-muted" : "text-fg")}>
            {label}
          </span>
          {badge && <span className="shrink-0 rounded bg-bg-subtle px-1 py-px text-[9.5px] font-medium text-fg-subtle">{badge}</span>}
        </span>
        {(sublabel || missing) && (
          <span className="mt-px block truncate text-xs text-fg-subtle">
            {missing ? "No longer available" : sublabel}
          </span>
        )}
      </span>
    </span>
  );

  // A dead link is not a link. Rendering it as a plain row rather than an anchor
  // stops a click going nowhere and reporting a 404 as though it were the app's fault.
  if (missing) return <li className="block">{body}</li>;

  return (
    <li>
      <Link href={href} className="block transition-colors hover:bg-bg-muted">
        {body}
      </Link>
    </li>
  );
}
