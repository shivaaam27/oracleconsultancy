"use client";

import { useState, useTransition } from "react";
import { Megaphone, X, Pin, CheckCircle2, Sparkles, Languages } from "lucide-react";
import { Button } from "@/components/ui";
import { Panel } from "@/components/surface-kit";
import { ANNOUNCEMENT_TYPES, AUDIENCE_KINDS, type AudienceKind } from "@/lib/announcements-shared";
import {
  saveAnnouncementAction,
  portalCreateAnnouncement,
  draftAnnouncementAction,
  translateAnnouncementAction,
} from "@/app/announcements/actions";

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
  // Controlled so the AI helpers can fill them in.
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

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
        setTitle(""); setBody(""); setAiPrompt("");
        setTimeout(() => { setOpen(false); setDone(null); }, 1200);
      } else {
        setError(res.error);
      }
    });
  }

  function aiDraft() {
    if (!aiPrompt.trim()) return;
    setError(null);
    setAiBusy(true);
    (async () => {
      const res = await draftAnnouncementAction(aiPrompt);
      if (res.ok) { setTitle(res.title); setBody(res.body); }
      else setError(res.error);
      setAiBusy(false);
    })();
  }

  function translate(to: "sw" | "en") {
    if (!body.trim()) return;
    setError(null);
    setAiBusy(true);
    (async () => {
      const res = await translateAnnouncementAction(body, to);
      if (res.ok) setBody(res.text);
      else setError(res.error);
      setAiBusy(false);
    })();
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

        {/* AI draft — describe it, COS writes the title + body for review. */}
        <div className="flex flex-col gap-2 rounded-xl border border-accent/25 bg-accent-soft/30 p-2.5 sm:flex-row sm:items-center">
          <Sparkles size={15} className="hidden shrink-0 text-accent sm:block" />
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe it — e.g. office closed Friday for Eid"
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent-ring/50"
          />
          <Button type="button" size="sm" variant="secondary" loading={aiBusy} disabled={!aiPrompt.trim()} onClick={aiDraft} className="gap-1.5 shrink-0">
            <Sparkles size={13} /> Draft with AI
          </Button>
        </div>

        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. Office closed Friday"
          className="w-full rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-ring/50"
        />
        <textarea
          name="body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the announcement…"
          className="w-full resize-y rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-ring/50"
        />
        <div className="-mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-fg-muted">Translate:</span>
          <button type="button" disabled={aiBusy || !body.trim()} onClick={() => translate("sw")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent-soft/60 disabled:opacity-40">
            <Languages size={12} /> Swahili
          </button>
          <button type="button" disabled={aiBusy || !body.trim()} onClick={() => translate("en")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent-soft/60 disabled:opacity-40">
            <Languages size={12} /> English
          </button>
        </div>

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
          <label className="flex items-center gap-2 text-sm text-fg" title="Shows as a full-screen card staff must acknowledge before continuing. Best for true emergencies.">
            <input type="checkbox" name="takeover" className="accent-[hsl(var(--danger))]" />
            <Megaphone size={13} className="text-danger" /> Urgent takeover
          </label>
        </div>

        <div className="rounded-xl border border-border bg-bg-subtle/40 p-2.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-muted">Also send by</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="deliverChannels" value="email" className="accent-[hsl(var(--accent))]" /> Email draft
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="deliverChannels" value="whatsapp" className="accent-[hsl(var(--accent))]" /> WhatsApp draft
            </label>
            <span className="text-[11px] text-fg-subtle">Drafts land in the Outbox · push &amp; in-app are automatic</span>
          </div>
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
