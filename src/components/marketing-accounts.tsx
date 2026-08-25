"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { SearchInput, Button, FIELD } from "@/components/ui";
import { SelectField } from "@/components/select-field";
import { PLATFORMS, PLATFORM_LABEL, PLATFORM_NEEDS, type Platform } from "@/lib/marketing-shared";
import { createAccountAction, archiveAccountAction } from "@/app/marketing/actions";

export type AccountRow = {
  id: number;
  platform: string;
  handle: string;
  display_name: string | null;
  company_id: number | null;
  client_id: number | null;
  profile_url: string | null;
  professional: boolean | null;
  archived: boolean;
};

type Owner = { id: number; name: string };

/**
 * The accounts we post to — on the same list shell as every other record in COS.
 *
 * ⚠️ `professional` IS THREE-STATE, and the rail keeps it that way. "Nobody has
 * checked" and "it is a personal account" are different facts: the first is a
 * five-minute job in the app, the second is a wall nothing we build can get
 * round. Collapsing them would hide which one you are looking at.
 */
export function MarketingAccounts({
  accounts, companies, clients,
}: {
  accounts: AccountRow[];
  companies: Owner[];
  clients: Owner[];
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const live = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  const byPlatform = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of live) m.set(a.platform, (m.get(a.platform) ?? 0) + 1);
    return m;
  }, [live]);

  const unchecked = live.filter((a) => a.professional === null).length;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = kind === "archived" ? archived : live;
    return base
      .filter((a) => (kind && kind !== "archived" && kind !== "unchecked" ? a.platform === kind : true))
      .filter((a) => (kind === "unchecked" ? a.professional === null : true))
      .filter((a) =>
        !term ||
        a.handle.toLowerCase().includes(term) ||
        (a.display_name ?? "").toLowerCase().includes(term));
  }, [live, archived, q, kind]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All accounts", count: live.length, href: "#", active: !kind, onSelect: () => setKind(null) },
    ...[...byPlatform.entries()].map(([p, n]) => ({
      key: p, label: PLATFORM_LABEL[p as Platform] ?? p, count: n, href: "#",
      active: kind === p, group: "Platform", onSelect: () => setKind(p),
    })),
    ...(unchecked > 0
      ? [{ key: "unchecked", label: "Not checked", count: unchecked, href: "#", active: kind === "unchecked", group: "Needs a look", tone: "warn" as const, onSelect: () => setKind("unchecked") }]
      : []),
    ...(archived.length > 0
      ? [{ key: "archived", label: "Archived", count: archived.length, href: "#", active: kind === "archived", group: "Archive", onSelect: () => setKind("archived") }]
      : []),
  ];

  const columns: RecordColumn<AccountRow>[] = [
    {
      key: "handle", label: "Account", width: "minmax(0,1.2fr)",
      render: (a) => (
        <span className="min-w-0">
          <span className="block truncate text-base font-medium text-fg">{a.handle}</span>
          {a.display_name && <span className="block truncate text-xs text-fg-subtle">{a.display_name}</span>}
        </span>
      ),
      csv: (a) => a.handle,
    },
    {
      key: "platform", label: "Platform", width: "120px",
      render: (a) => <span className="truncate">{PLATFORM_LABEL[a.platform as Platform] ?? a.platform}</span>,
      csv: (a) => a.platform,
    },
    {
      key: "owner", label: "Belongs to", width: "minmax(0,1fr)", hideBelow: "md",
      render: (a) => (
        <span className="truncate text-fg-muted">
          {a.company_id != null ? companyName.get(a.company_id) ?? "—" : clientName.get(a.client_id!) ?? "—"}
        </span>
      ),
      csv: (a) => (a.company_id != null ? companyName.get(a.company_id) ?? "" : clientName.get(a.client_id!) ?? ""),
    },
    {
      key: "professional", label: "Can be read", width: "150px",
      render: (a) =>
        a.professional === true ? <span className="text-success">Professional</span>
        : a.professional === false ? <span className="text-danger" title={PLATFORM_NEEDS[a.platform as Platform]}>Personal</span>
        : <span className="text-warn" title={PLATFORM_NEEDS[a.platform as Platform]}>Not checked</span>,
      csv: (a) => (a.professional === true ? "professional" : a.professional === false ? "personal" : "not checked"),
    },
  ];

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        filters={rail}
        listKey="mkt_account"
        exportName="marketing-accounts"
        total={live.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search accounts…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-sm"
            />
            <span className="grow" />
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> New account
            </button>
          </div>
        }
        rowActions={(a) => (
          <form action={archiveAccountAction}>
            <input type="hidden" name="id" value={a.id} />
            {a.archived && <input type="hidden" name="restore" value="on" />}
            <Button type="submit" size="xs" variant="ghost">{a.archived ? "Restore" : "Archive"}</Button>
          </form>
        )}
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-base font-medium text-fg-muted">No accounts yet.</p>
            <p className="max-w-[26rem] text-sm text-fg-subtle">
              Add the four you already run and every post has somewhere to go.
            </p>
          </div>
        }
      />

      {adding && (
        <BottomSheet open onClose={() => setAdding(false)} title="New account">
          <form action={createAccountAction} onSubmit={() => setAdding(false)} className="flex flex-col gap-3 px-1 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Platform">
                <SelectField name="platform" defaultValue="instagram"
                  options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))} />
              </Field>
              <Field label="Handle">
                <input name="handle" className={FIELD} placeholder="@cocozuri" required autoFocus />
              </Field>
            </div>

            <Field label="Name it goes by">
              <input name="displayName" className={FIELD} placeholder="CocoZuri Chocolat" />
            </Field>

            {/* ⚠️ Exactly one owner. The database refuses both or neither; the
                write door says so in English before it gets that far. */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="One of our companies">
                <SelectField name="companyId" placeholder="Not ours"
                  options={[{ value: "", label: "Not ours — a client's" },
                    ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
              </Field>
              <Field label="…or a client">
                <SelectField name="clientId" placeholder="Not a client's"
                  options={[{ value: "", label: "Not a client's — one of ours" },
                    ...clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
              </Field>
            </div>

            <Field label="Business or Creator account?">
              <SelectField name="professional" placeholder="Nobody has checked"
                options={[
                  { value: "", label: "Nobody has checked" },
                  { value: "yes", label: "Yes — professional" },
                  { value: "no", label: "No — personal" },
                ]} />
            </Field>

            <Field label="Link to the profile">
              <input name="profileUrl" className={FIELD} placeholder="https://instagram.com/cocozuri" />
            </Field>

            <Button type="submit" variant="primary" className="mt-1 w-full">Add account</Button>
          </form>
        </BottomSheet>
      )}
    </>
  );
}

/** The same field wrapper the other module sheets use. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
      {hint && <span className="text-xs leading-snug text-fg-subtle">{hint}</span>}
    </label>
  );
}
