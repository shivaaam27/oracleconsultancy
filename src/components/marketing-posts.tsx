"use client";

import { useMemo, useState } from "react";
import { Plus, ExternalLink } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { SearchInput, Button, FIELD, CONTROL_BOX_SM, Textarea } from "@/components/ui";
import { SelectField } from "@/components/select-field";
import {
  POST_KINDS, POST_STATE_LABEL, POST_STATE_TONE, PLATFORM_LABEL,
  type MktPublication, type Platform, type PostState,
} from "@/lib/marketing-shared";
import {
  createPostAction, markPublishedAction, markNotOutAction, archivePostAction,
} from "@/app/marketing/actions";

export type PostRow = {
  id: number;
  title: string;
  caption: string | null;
  kind: string;
  campaign_id: number | null;
  company_id: number | null;
  client_id: number | null;
  archived: boolean;
  state: PostState;
  publications: MktPublication[];
};

type Named = { id: number; name: string };
export type AccountLite = { id: number; platform: string; handle: string };
/** A picture you can attach, with a short-lived link for the thumbnail. */
export type AssetLite = { id: number; caption: string | null; fileName: string; url: string | null; kind: string };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }) : null;

const TONE_TEXT: Record<string, string> = {
  success: "text-success", warn: "text-warn", danger: "text-danger",
  info: "text-accent", default: "text-fg-muted",
};

const STATES: PostState[] = ["overdue", "scheduled", "partly out", "published", "idea", "failed", "removed"];

/**
 * Posts, and the quick log.
 *
 * ⚠️ SPEED IS THE WHOLE DESIGN. One person does the posting; if writing it down
 * takes more than a few seconds it stops happening in week three, and a
 * half-filled record is worse than none because it still gets half-trusted. Only
 * a name is required — everything else can be filled in afterwards.
 *
 * ⚠️ THE ROW SHOWS THE STATE; THE SHEET SHOWS EACH DESTINATION. One design going
 * to three accounts is three publications, and one can fail while the others go
 * out — but putting all three and their controls in a list row is what made this
 * screen unreadable. The row says "partly out"; opening it says which.
 */
export function MarketingPosts({
  posts, accounts, campaigns, companies, clients, assets, initialState,
}: {
  posts: PostRow[];
  accounts: AccountLite[];
  campaigns: Named[];
  companies: Named[];
  clients: Named[];
  /** Recent pictures, for attaching without leaving the sheet. */
  assets: AssetLite[];
  initialState?: string;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<string | null>(initialState ?? null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<PostRow | null>(null);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const campaignName = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const live = posts.filter((p) => !p.archived);
  const archived = posts.filter((p) => p.archived);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of live) m.set(p.state, (m.get(p.state) ?? 0) + 1);
    return m;
  }, [live]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = view === "archived" ? archived : live;
    return base
      .filter((p) => (view && view !== "archived" ? p.state === view : true))
      .filter((p) => !term || p.title.toLowerCase().includes(term) || (p.caption ?? "").toLowerCase().includes(term));
  }, [live, archived, q, view]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All posts", count: live.length, href: "#", active: !view, onSelect: () => setView(null) },
    ...STATES.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
      key: s, label: POST_STATE_LABEL[s], count: counts.get(s)!, href: "#",
      active: view === s, group: "How it is getting on",
      tone: (POST_STATE_TONE[s] === "default" ? undefined : POST_STATE_TONE[s]) as RecordFilter["tone"],
      onSelect: () => setView(s),
    })),
    ...(archived.length > 0
      ? [{ key: "archived", label: "Archived", count: archived.length, href: "#", active: view === "archived", group: "Archive", onSelect: () => setView("archived") }]
      : []),
  ];

  /** The soonest thing that matters: when it went out, else when it is due. */
  const keyMoment = (p: PostRow) => {
    const out = p.publications.map((x) => x.publishedAt).filter(Boolean).sort()[0];
    if (out) return { label: when(out)!, note: "out" };
    const due = p.publications.map((x) => x.plannedFor).filter(Boolean).sort()[0];
    if (due) return { label: when(due)!, note: "due" };
    return null;
  };

  const columns: RecordColumn<PostRow>[] = [
    {
      key: "title", label: "Post", width: "minmax(0,1.6fr)",
      render: (p) => {
        const owner = p.company_id != null ? companyName.get(p.company_id)
          : p.client_id != null ? clientName.get(p.client_id) : null;
        return (
          <span className="min-w-0">
            <button
              type="button"
              onClick={() => setOpen(p)}
              className="block max-w-full truncate text-left text-base font-medium text-fg hover:text-accent"
            >
              {p.title}
            </button>
            <span className="block truncate text-xs text-fg-subtle">
              {[owner, p.caption].filter(Boolean).join(" · ") || "—"}
            </span>
          </span>
        );
      },
      csv: (p) => p.title,
    },
    {
      key: "owner", label: "For", width: "minmax(0,0.9fr)", hideBelow: "md", defaultHidden: true,
      render: (p) => (
        <span className="truncate text-fg-muted">
          {p.company_id != null ? companyName.get(p.company_id) ?? "—"
            : p.client_id != null ? clientName.get(p.client_id) ?? "—"
            : "—"}
        </span>
      ),
      csv: (p) => (p.company_id != null ? companyName.get(p.company_id) ?? "" : p.client_id != null ? clientName.get(p.client_id) ?? "" : ""),
    },
    {
      key: "where", label: "Where", width: "minmax(0,0.9fr)", hideBelow: "lg", defaultHidden: true,
      render: (p) => (
        <span className="truncate text-fg-muted">
          {p.publications.length === 0
            ? <span className="text-fg-subtle">nowhere yet</span>
            : p.publications.map((x) => accountById.get(x.accountId)?.handle ?? "?").join(", ")}
        </span>
      ),
      csv: (p) => p.publications.map((x) => accountById.get(x.accountId)?.handle ?? "").join(" "),
    },
    {
      key: "state", label: "State", width: "130px",
      render: (p) => <span className={TONE_TEXT[POST_STATE_TONE[p.state]]}>{POST_STATE_LABEL[p.state]}</span>,
      csv: (p) => p.state,
    },
    {
      key: "when", label: "When", width: "140px", align: "right", hideBelow: "md",
      render: (p) => {
        const k = keyMoment(p);
        if (!k) return <span className="text-fg-subtle">—</span>;
        return (
          <span className="tabular text-fg-muted">
            <span className="text-fg-subtle">{k.note} </span>{k.label}
          </span>
        );
      },
      csv: (p) => keyMoment(p)?.label ?? "",
    },
  ];

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        onRowClick={(p) => setOpen(p)}
        filters={rail}
        listKey="mkt_post"
        exportName="marketing-posts"
        total={live.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search posts…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-sm"
            />
            <span className="grow" />
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> Log a post
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-base font-medium text-fg-muted">Nothing logged yet.</p>
            <p className="max-w-[26rem] text-sm text-fg-subtle">
              Post it, then write it down — it should take about fifteen seconds.
            </p>
          </div>
        }
      />

      {adding && (
        <NewPostSheet
          accounts={accounts} campaigns={campaigns} companies={companies} clients={clients}
          assets={assets}
          onClose={() => setAdding(false)}
        />
      )}

      {open && (
        <PostSheet
          post={open}
          accountById={accountById}
          campaignName={campaignName}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/* ── the quick log ───────────────────────────────────────────────────────── */

function NewPostSheet({
  accounts, campaigns, companies, clients, assets, onClose,
}: {
  accounts: AccountLite[]; campaigns: Named[]; companies: Named[]; clients: Named[];
  assets: AssetLite[]; onClose: () => void;
}) {
  return (
    <BottomSheet open onClose={onClose} title="Log a post">
      <form action={createPostAction} onSubmit={onClose} className="flex flex-col gap-3 px-1 pb-2">
        <Field label="What is it" hint="A short name, so you can find it again. Nothing else is required.">
          <input name="title" className={FIELD} placeholder="Amber Rabdi on the marble slab" required autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <SelectField name="kind" defaultValue="photo"
              options={POST_KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} />
          </Field>
          <Field label="Campaign">
            <SelectField name="campaignId" placeholder="None"
              options={[{ value: "", label: "None" }, ...campaigns.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
        </div>

        <Field label="Caption">
          <Textarea name="caption" rows={3} placeholder="What actually gets posted. Fill it in later if you are in a hurry." />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="For which company">
            <SelectField name="companyId" placeholder="Not set"
              options={[{ value: "", label: "Not set" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
          <Field label="…or client">
            <SelectField name="clientId" placeholder="Not set"
              options={[{ value: "", label: "Not set" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
        </div>

        <Field label="Where it goes" hint="Leave them all unticked and it is recorded as an idea.">
          {accounts.length === 0 ? (
            <span className="text-sm text-fg-muted">No accounts yet — add one first.</span>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-0.5">
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="accountIds" value={a.id} className="h-4 w-4 rounded" />
                  <span className="text-fg-subtle">{PLATFORM_LABEL[a.platform as Platform] ?? a.platform}</span>
                  <span className="font-medium text-fg">{a.handle}</span>
                </label>
              ))}
            </div>
          )}
        </Field>

        {/* ⚠️ This is what writes `mkt_post_assets`, and therefore what makes the
            library's "never used" pile mean anything. Without it every picture
            would read as unused for ever. */}
        {assets.length > 0 && (
          <Field label="Pictures it was made from" hint="Optional. Tick any from the library.">
            <div className="flex flex-wrap gap-2 pt-0.5">
              {assets.map((a) => (
                <label key={a.id} className="relative cursor-pointer" title={a.caption || a.fileName}>
                  <input type="checkbox" name="assetIds" value={a.id} className="peer sr-only" />
                  <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-border bg-bg-subtle peer-checked:border-accent peer-checked:ring-2 peer-checked:ring-accent-ring/60">
                    {a.url && a.kind !== "video"
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={a.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      : <span className="text-xs text-fg-subtle">{a.kind === "video" ? "▶" : "?"}</span>}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due to go out"><input name="plannedFor" type="datetime-local" className={FIELD} /></Field>
          <Field label="Link, if it is already up"><input name="url" className={FIELD} placeholder="https://…" /></Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" name="alreadyPublished" className="h-4 w-4 rounded" />
          I have just posted this by hand — record it as out now
        </label>

        <Button type="submit" variant="primary" className="mt-1 w-full">Save</Button>
      </form>
    </BottomSheet>
  );
}

/* ── one post, and each place it went ────────────────────────────────────── */

function PostSheet({
  post, accountById, campaignName, onClose,
}: {
  post: PostRow;
  accountById: Map<number, AccountLite>;
  campaignName: Map<number, string>;
  onClose: () => void;
}) {
  return (
    <BottomSheet open onClose={onClose} title={post.title}>
      <div className="flex flex-col gap-4 px-1 pb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className={TONE_TEXT[POST_STATE_TONE[post.state]]}>{POST_STATE_LABEL[post.state]}</span>
          <span className="text-fg-subtle">{post.kind}</span>
          {post.campaign_id != null && (
            <span className="text-fg-muted">{campaignName.get(post.campaign_id)}</span>
          )}
        </div>

        {post.caption && (
          <p className="whitespace-pre-wrap rounded-md bg-bg-subtle px-3 py-2 text-sm text-fg-muted">{post.caption}</p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Where it went</span>
          {post.publications.length === 0 ? (
            <p className="text-sm text-fg-muted">Nowhere yet — this is still an idea.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {post.publications.map((pub) => {
                const a = accountById.get(pub.accountId);
                return (
                  <li key={pub.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2 text-sm">
                    <span className="min-w-[9rem] font-medium text-fg">
                      {a ? a.handle : "unknown"}
                      <span className="ml-1.5 font-normal text-fg-subtle">
                        {a ? PLATFORM_LABEL[a.platform as Platform] ?? a.platform : ""}
                      </span>
                    </span>

                    {pub.status === "published" && <span className="text-success">out {when(pub.publishedAt)}</span>}
                    {pub.status === "planned" && <span className="text-fg-subtle">due {when(pub.plannedFor) ?? "— no time set"}</span>}
                    {(pub.status === "failed" || pub.status === "removed") && (
                      <span className="text-danger">{pub.status === "failed" ? "did not go" : "taken down"} — {pub.reason}</span>
                    )}

                    {pub.url && (
                      <a href={pub.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">
                        <ExternalLink size={12} /> look
                      </a>
                    )}

                    {pub.status === "planned" && (
                      <form action={markPublishedAction} onSubmit={onClose} className="ml-auto flex items-center gap-1.5">
                        <input type="hidden" name="id" value={pub.id} />
                        <input name="url" placeholder="link" className={`${CONTROL_BOX_SM} w-32 px-2`} />
                        <Button type="submit" size="xs" variant="secondary">It went out</Button>
                      </form>
                    )}
                    {pub.status === "published" && (
                      /* ⚠️ Never a delete. A post taken down still happened, and
                         the reason is required — see the write door. */
                      <form action={markNotOutAction} onSubmit={onClose} className="ml-auto flex items-center gap-1.5">
                        <input type="hidden" name="id" value={pub.id} />
                        <input type="hidden" name="status" value="removed" />
                        <input name="reason" placeholder="why taken down" required className={`${CONTROL_BOX_SM} w-36 px-2`} />
                        <Button type="submit" size="xs" variant="ghost">Taken down</Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form action={archivePostAction} onSubmit={onClose} className="border-t border-border pt-3">
          <input type="hidden" name="id" value={post.id} />
          {post.archived && <input type="hidden" name="restore" value="on" />}
          <Button type="submit" size="sm" variant="ghost">{post.archived ? "Restore this post" : "Archive this post"}</Button>
        </form>
      </div>
    </BottomSheet>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
      {hint && <span className="text-xs leading-snug text-fg-subtle">{hint}</span>}
    </label>
  );
}
