"use client";

import { useMemo, useState } from "react";
import { Upload, Trash2, Archive } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { SearchInput, Button, FIELD } from "@/components/ui";
import { SelectField } from "@/components/select-field";
import { FluidSelect } from "@/components/fluid-select";
import { createAssetSlotAction, discardAssetUploadAction, saveAssetAction } from "@/app/marketing/upload-actions";
import { archiveAssetAction, deleteAssetAction, updateAssetAction } from "@/app/marketing/actions";

export type LibraryAsset = {
  id: number;
  storage_path: string;
  file_name: string;
  mime: string | null;
  bytes: number | null;
  kind: string;
  shoot_id: number | null;
  company_id: number | null;
  client_id: number | null;
  caption: string | null;
  tags: string | null;
  archived: boolean;
  created_at: string;
  /** How many posts were made from it. 0 = never used. */
  uses: number;
  /** Short-lived link, minted on the server. Never stored. */
  url: string | null;
};

type Named = { id: number; name: string };

const KB = 1024;
const size = (b: number | null) =>
  b == null ? "—" : b < KB * KB ? `${Math.round(b / KB)} KB` : `${(b / (KB * KB)).toFixed(1)} MB`;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });

/**
 * The picture library.
 *
 * ⚠️ THE "NEVER USED" RAIL IS THE POINT OF THIS SCREEN. Everything from a shoot
 * is kept, not only what got published — that pile is where next month's posts
 * come from, and today it lives on a phone until the phone is replaced.
 */
export function MarketingLibrary({
  assets, shoots, companies, clients,
}: {
  assets: LibraryAsset[];
  shoots: Named[];
  companies: Named[];
  clients: Named[];
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<LibraryAsset | null>(null);

  const shootName = useMemo(() => new Map(shoots.map((s) => [s.id, s.name])), [shoots]);
  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const live = assets.filter((a) => !a.archived);
  const archived = assets.filter((a) => a.archived);
  const unused = live.filter((a) => a.uses === 0);
  const videos = live.filter((a) => a.kind === "video");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = view === "archived" ? archived : live;
    return base
      .filter((a) =>
        view === "unused" ? a.uses === 0
        : view === "video" ? a.kind === "video"
        : true)
      .filter((a) =>
        !term ||
        a.file_name.toLowerCase().includes(term) ||
        (a.caption ?? "").toLowerCase().includes(term) ||
        (a.tags ?? "").toLowerCase().includes(term));
  }, [live, archived, q, view]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All pictures", count: live.length, href: "#", active: !view, onSelect: () => setView(null) },
    ...(unused.length > 0
      ? [{ key: "unused", label: "Never used", count: unused.length, href: "#", active: view === "unused", group: "The pile", tone: "info" as const, onSelect: () => setView("unused") }]
      : []),
    ...(videos.length > 0
      ? [{ key: "video", label: "Video", count: videos.length, href: "#", active: view === "video", group: "Kind", onSelect: () => setView("video") }]
      : []),
    ...(archived.length > 0
      ? [{ key: "archived", label: "Archived", count: archived.length, href: "#", active: view === "archived", group: "Archive", onSelect: () => setView("archived") }]
      : []),
  ];

  const columns: RecordColumn<LibraryAsset>[] = [
    {
      key: "thumb", label: "", width: "56px",
      render: (a) => (
        <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-bg-subtle">
          {a.url && a.kind !== "video" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={a.url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="text-xs text-fg-subtle">{a.kind === "video" ? "▶" : "?"}</span>
          )}
        </span>
      ),
      csv: () => "",
    },
    {
      key: "name", label: "Picture", width: "minmax(0,1.4fr)",
      render: (a) => (
        <span className="min-w-0">
          <button type="button" onClick={() => setEditing(a)} className="block max-w-full truncate text-left text-base font-medium text-fg hover:text-accent">
            {a.caption || a.file_name}
          </button>
          {a.tags && <span className="block truncate text-xs text-fg-subtle">{a.tags}</span>}
        </span>
      ),
      csv: (a) => a.caption || a.file_name,
    },
    {
      key: "shoot", label: "Shoot", width: "minmax(0,1fr)", hideBelow: "md",
      render: (a) => <span className="truncate text-fg-muted">{a.shoot_id != null ? shootName.get(a.shoot_id) ?? "—" : "—"}</span>,
      csv: (a) => (a.shoot_id != null ? shootName.get(a.shoot_id) ?? "" : ""),
    },
    {
      key: "owner", label: "For", width: "minmax(0,0.9fr)", hideBelow: "lg", defaultHidden: true,
      render: (a) => (
        <span className="truncate text-fg-muted">
          {a.company_id != null ? companyName.get(a.company_id) ?? "—"
            : a.client_id != null ? clientName.get(a.client_id) ?? "—" : "—"}
        </span>
      ),
      csv: (a) => (a.company_id != null ? companyName.get(a.company_id) ?? "" : a.client_id != null ? clientName.get(a.client_id) ?? "" : ""),
    },
    {
      key: "uses", label: "Used", width: "90px", align: "right",
      /* ⚠️ Nothing is stored — counted from the posts that were made from it. */
      render: (a) => a.uses === 0
        ? <span className="text-accent">never</span>
        : <span className="tabular text-fg-muted">{a.uses}×</span>,
      csv: (a) => a.uses,
    },
    {
      key: "added", label: "Added", width: "130px", align: "right", hideBelow: "md",
      render: (a) => <span className="tabular text-fg-muted">{day(a.created_at)}</span>,
      csv: (a) => a.created_at.slice(0, 10),
    },
    {
      key: "size", label: "Size", width: "90px", align: "right", hideBelow: "lg", defaultHidden: true,
      render: (a) => <span className="tabular text-fg-subtle">{size(a.bytes)}</span>,
      csv: (a) => a.bytes,
    },
  ];

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        onRowClick={(a) => setEditing(a)}
        filters={rail}
        listKey="mkt_asset"
        exportName="marketing-library"
        total={live.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search captions and tags…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-sm"
            />
            <span className="grow" />
            <button
              type="button"
              onClick={() => setUploading(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Upload size={13} /> Add pictures
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-base font-medium text-fg-muted">Nothing in the library.</p>
            <p className="max-w-[26rem] text-sm text-fg-subtle">
              Everything from a shoot goes in here — used and unused. The unused pile is where next
              month&apos;s posts come from.
            </p>
          </div>
        }
      />

      {uploading && <UploadSheet shoots={shoots} companies={companies} clients={clients} onClose={() => setUploading(false)} />}

      {editing && (
        <AssetSheet
          asset={editing}
          shoots={shoots}
          companies={companies}
          clients={clients}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/* ── uploading ───────────────────────────────────────────────────────────── */

type Job = { file: File; state: "waiting" | "sending" | "done" | "failed"; error?: string };

function UploadSheet({
  shoots, companies, clients, onClose,
}: {
  shoots: Named[]; companies: Named[]; clients: Named[]; onClose: () => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  /* ⚠️ Real state, not hidden inputs. This sheet is driven by JavaScript rather
     than submitted as a form, so there is nothing to read a hidden field out
     of — `SelectField` exists for the server-action forms elsewhere. */
  const [shoot, setShoot] = useState("");
  const [company, setCompany] = useState("");
  const [client, setClient] = useState("");
  const [tags, setTags] = useState("");

  const done = jobs.filter((j) => j.state === "done").length;

  /**
   * ⚠️ EACH FILE GOES STRAIGHT TO STORAGE, ONE AT A TIME. The bytes never touch
   * a server action — a serverless body caps at 4.5 MB and a phone photo is
   * bigger, so a route that carried them would refuse exactly the pictures
   * somebody just took.
   */
  async function send() {
    if (busy || jobs.length === 0) return;
    setBusy(true);
    const shootId = Number(shoot) || null;
    const companyId = Number(company) || null;
    const clientId = Number(client) || null;
    const theTags = tags.trim() || null;

    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].state === "done") continue;
      setJobs((prev) => prev.map((j, n) => (n === i ? { ...j, state: "sending" } : j)));
      const file = jobs[i].file;
      try {
        const slot = await createAssetSlotAction(file.name);
        if (!slot.ok) throw new Error(slot.error);

        const put = await fetch(slot.signedUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);

        const saved = await saveAssetAction({
          stagedPath: slot.path,
          fileName: file.name,
          mime: file.type || null,
          bytes: file.size,
          shootId, companyId, clientId, tags: theTags,
        });
        if (!saved.ok) {
          // The file is in storage but no row points at it — bin it rather than
          // leave an orphan nobody can see.
          await discardAssetUploadAction(slot.path);
          throw new Error(saved.error);
        }
        setJobs((prev) => prev.map((j, n) => (n === i ? { ...j, state: "done" } : j)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Did not save.";
        setJobs((prev) => prev.map((j, n) => (n === i ? { ...j, state: "failed", error: msg } : j)));
      }
    }
    setBusy(false);
  }

  return (
    <BottomSheet open onClose={onClose} title="Add pictures">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <Field label="Which shoot" hint="Optional — a one-off photo belongs to none. Applies to everything you add now.">
          <FluidSelect value={shoot} onSelect={setShoot} placeholder="None" className="w-full"
            options={[{ value: "", label: "None" }, ...shoots.map((s) => ({ value: String(s.id), label: s.name }))]} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="For which company">
            <FluidSelect value={company} onSelect={setCompany} placeholder="Not set" className="w-full"
              options={[{ value: "", label: "Not set" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
          <Field label="…or client">
            <FluidSelect value={client} onSelect={setClient} placeholder="Not set" className="w-full"
              options={[{ value: "", label: "Not set" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
        </div>

        <Field label="Tags" hint="Product, person, place — whatever you would search for.">
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={FIELD} placeholder="amber rabdi, marble slab, kitchen" />
        </Field>

        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-4 py-6 text-center hover:border-accent">
          <Upload size={18} className="text-fg-subtle" />
          <span className="text-sm font-medium text-fg">Choose photos or videos</span>
          <span className="text-xs text-fg-subtle">They upload straight from this device.</span>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setJobs(files.map((file) => ({ file, state: "waiting" as const })));
            }}
          />
        </label>

        {jobs.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {jobs.map((j, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-fg-muted">{j.file.name}</span>
                <span className={
                  j.state === "done" ? "text-success"
                  : j.state === "failed" ? "text-danger"
                  : j.state === "sending" ? "text-accent" : "text-fg-subtle"
                }>
                  {j.state === "done" ? "saved"
                    : j.state === "failed" ? (j.error ?? "failed")
                    : j.state === "sending" ? "sending…" : size(j.file.size)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Button type="button" variant="primary" className="mt-1 w-full" onClick={send} loading={busy} disabled={jobs.length === 0}>
          {done > 0 && done === jobs.length ? "All saved" : `Upload ${jobs.length || ""}`.trim()}
        </Button>

        {done > 0 && done === jobs.length && (
          <Button type="button" variant="secondary" className="w-full" onClick={() => location.reload()}>
            Done — show them
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

/* ── one picture ─────────────────────────────────────────────────────────── */

function AssetSheet({
  asset, shoots, companies, clients, onClose,
}: {
  asset: LibraryAsset; shoots: Named[]; companies: Named[]; clients: Named[]; onClose: () => void;
}) {
  return (
    <BottomSheet open onClose={onClose} title={asset.caption || asset.file_name}>
      <div className="flex flex-col gap-3 px-1 pb-2">
        {asset.url && asset.kind !== "video" && (
          <span className="flex max-h-64 justify-center overflow-hidden rounded-lg bg-bg-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt={asset.caption ?? ""} className="max-h-64 object-contain" />
          </span>
        )}
        {asset.url && asset.kind === "video" && (
          <video src={asset.url} controls className="max-h-64 w-full rounded-lg bg-black" />
        )}

        <form action={updateAssetAction} onSubmit={onClose} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={asset.id} />
          <Field label="Caption">
            <input name="caption" defaultValue={asset.caption ?? ""} className={FIELD} placeholder="What it shows" />
          </Field>
          <Field label="Tags">
            <input name="tags" defaultValue={asset.tags ?? ""} className={FIELD} placeholder="product, person, place" />
          </Field>
          <Field label="Shoot">
            <SelectField name="shootId" defaultValue={asset.shoot_id ? String(asset.shoot_id) : ""} placeholder="None"
              options={[{ value: "", label: "None" }, ...shoots.map((s) => ({ value: String(s.id), label: s.name }))]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company">
              <SelectField name="companyId" defaultValue={asset.company_id ? String(asset.company_id) : ""} placeholder="Not set"
                options={[{ value: "", label: "Not set" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
            </Field>
            <Field label="…or client">
              <SelectField name="clientId" defaultValue={asset.client_id ? String(asset.client_id) : ""} placeholder="Not set"
                options={[{ value: "", label: "Not set" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
            </Field>
          </div>
          <Button type="submit" variant="primary" className="w-full">Save</Button>
        </form>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-sm text-fg-subtle">
            {asset.uses === 0 ? "Never used in a post." : `Used in ${asset.uses} post${asset.uses === 1 ? "" : "s"}.`}
          </span>
          <span className="grow" />
          <form action={archiveAssetAction} onSubmit={onClose}>
            <input type="hidden" name="id" value={asset.id} />
            {asset.archived && <input type="hidden" name="restore" value="on" />}
            <Button type="submit" size="xs" variant="ghost">
              <Archive size={12} /> {asset.archived ? "Restore" : "Archive"}
            </Button>
          </form>
          {/* ⚠️ Only offered when nothing was made from it. The write door and the
              database both refuse otherwise — deleting a picture a post was made
              from would quietly rewrite what that post was. */}
          {asset.uses === 0 && (
            <form action={deleteAssetAction} onSubmit={onClose}>
              <input type="hidden" name="id" value={asset.id} />
              <Button type="submit" size="xs" variant="ghost" className="text-danger">
                <Trash2 size={12} /> Delete
              </Button>
            </form>
          )}
        </div>
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
