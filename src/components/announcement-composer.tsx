"use client";

import { useState, useTransition } from "react";
import { Megaphone, X, Pin, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Panel } from "@/components/surface-kit";
import { cn } from "@/lib/cn";
import { ANNOUNCEMENT_TYPES, AUDIENCE_KINDS, type AudienceKind } from "@/lib/announcements-shared";
import { saveAnnouncementAction, portalCreateAnnouncement } from "@/app/announcements/actions";

export type Opt = { value: string; label: string };

type Lists = {
  companies: Opt[];
  departments: Opt[];
  sites: Opt[];
  roles: Opt[];
  personTypes: Opt[];
  people: Opt[];
};

/** The compose surface for a new (or edited) announcement. `mode="admin"` adds
 *  draft/publish + scheduling; `mode="portal"` posts immediately. Managers get a
 *  trimmed audience list (their company / their people only). */
export function AnnouncementComposer({
  mode,
  lists,
  allowedKinds,
}: {
  mode: "admin" | "portal";
  lists: Lists;
  /** Restrict the audience kinds (managers); defaults to all. */
  allowedKinds?: AudienceKind[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AudienceKind>("all");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const kinds = AUDIENCE_KINDS.filter((k) => !allowedKinds || allowedKinds.includes(k.value));
  const meta = AUDIENCE_KINDS.find((k) => k.value === kind);

  const valueOptions: Opt[] =
    kind === "company" ? lists.companies
    : kind === "department" ? lists.departments
    : kind === "site" ? lists.sites
    : kind === "role" ? lists.roles
    : kind === "person_type" ? lists.personTypes
    : kind === "people" ? lists.people
    : [];

  function submit(action: "draft" | "publish", form: HTMLFormElement) {
    setError(null);
    setDone(null);
    const fd = new FormData(form);
    fd.set("action", action);
    start(async () => {
      const res = mode === "admin" ? await saveAnnouncementAction(fd) : await portalCreateAnnouncement(fd);
      if (res.ok) {
        setDone(action === "draft" ? "Saved as draft." : "Published.");
        form.reset();
        setKind("all");
        setTimeout(() => { setOpen(false); setDone(null); }, 1200);
      } else {
        setError(res.error);
      }
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <Megaphone size={15} /> New announcement
      </Button>
    );
  }

  return (
    <Panel className="p-4 sm:p-5">
      <form
        onSubmit={(e) => { e.preventDefault(); }}
        className="flex flex-col gap-3.5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">New announcement</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-fg-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <input
          name="title"
          required
          placeholder="Title — e.g. Office closed Friday"
          className="w-full rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-ring/50"
        />
        <textarea
          name="body"
          rows={4}
          placeholder="Write the announcement…"
          className="w-full resize-y rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-ring/50"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Type
            <select name="type" defaultValue="operational" className="rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent-ring/50">
              {ANNOUNCEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Who sees it
            <select
              name="audienceKind"
              value={kind}
              onChange={(e) => setKind(e.target.value as AudienceKind)}
              className="rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent-ring/50"
            >
              {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
        </div>

        {meta?.needsValues && (
          <div className="rounded-xl border border-border bg-bg-subtle/40 p-2.5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-muted">Choose</div>
            {valueOptions.length === 0 ? (
              <p className="px-1 py-2 text-xs text-fg-subtle">No options available.</p>
            ) : (
              <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {valueOptions.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-muted/60">
                    <input type="checkbox" name="audienceValues" value={o.value} className="accent-[hsl(var(--accent))]" />
                    <span className="truncate">{o.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" name="pinned" className="accent-[hsl(var(--accent))]" />
            <Pin size={13} className="text-fg-muted" /> Pin to top
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" name="requireAck" className="accent-[hsl(var(--accent))]" />
            <CheckCircle2 size={13} className="text-fg-muted" /> Require acknowledgement
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            {mode === "admin" ? "Schedule (optional)" : "Go live (optional)"}
            <input type="datetime-local" name="publishAt" className="rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent-ring/50" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Expires (optional)
            <input type="datetime-local" name="expiresAt" className="rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent-ring/50" />
          </label>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {done && <p className="text-xs text-success">{done}</p>}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            loading={pending}
            onClick={(e) => submit("publish", e.currentTarget.closest("form")!)}
          >
            {mode === "admin" ? "Publish" : "Post"}
          </Button>
          {mode === "admin" && (
            <Button
              type="button"
              variant="secondary"
              loading={pending}
              onClick={(e) => submit("draft", e.currentTarget.closest("form")!)}
            >
              Save draft
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Panel>
  );
}
