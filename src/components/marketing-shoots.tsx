"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { SearchInput, Button, FIELD, Textarea } from "@/components/ui";
import { SelectField } from "@/components/select-field";
import { createShootAction, archiveShootAction } from "@/app/marketing/actions";

export type ShootRowView = {
  id: number;
  title: string;
  on_date: string | null;
  place: string | null;
  photographer_id: number | null;
  company_id: number | null;
  client_id: number | null;
  consent: boolean | null;
  archived: boolean;
  /** Pictures that came out of it. Counted on read. */
  assets: number;
};

type Named = { id: number; name: string };

const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

/**
 * Photography sessions.
 *
 * ⚠️ CONSENT IS THREE-STATE AND THE RAIL SAYS SO. A photograph of an
 * identifiable person is their personal information under Tanzania's data
 * protection rules. "Nobody has said" is not "no" and certainly not "yes" — one
 * tick box now answers a hard question later.
 */
export function MarketingShoots({
  shoots, people, companies, clients,
}: {
  shoots: ShootRowView[];
  people: Named[];
  companies: Named[];
  clients: Named[];
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const personName = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const live = shoots.filter((s) => !s.archived);
  const archived = shoots.filter((s) => s.archived);
  const unasked = live.filter((s) => s.consent === null);
  const empty = live.filter((s) => s.assets === 0);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = view === "archived" ? archived : live;
    return base
      .filter((s) =>
        view === "unasked" ? s.consent === null
        : view === "empty" ? s.assets === 0
        : true)
      .filter((s) => !term || s.title.toLowerCase().includes(term) || (s.place ?? "").toLowerCase().includes(term));
  }, [live, archived, q, view]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All shoots", count: live.length, href: "#", active: !view, onSelect: () => setView(null) },
    ...(unasked.length > 0
      ? [{ key: "unasked", label: "Consent not recorded", count: unasked.length, href: "#", active: view === "unasked", group: "Needs a look", tone: "warn" as const, onSelect: () => setView("unasked") }]
      : []),
    ...(empty.length > 0
      ? [{ key: "empty", label: "No pictures yet", count: empty.length, href: "#", active: view === "empty", group: "Needs a look", onSelect: () => setView("empty") }]
      : []),
    ...(archived.length > 0
      ? [{ key: "archived", label: "Archived", count: archived.length, href: "#", active: view === "archived", group: "Archive", onSelect: () => setView("archived") }]
      : []),
  ];

  const columns: RecordColumn<ShootRowView>[] = [
    {
      key: "title", label: "Shoot", width: "minmax(0,1.4fr)",
      render: (s) => (
        <span className="min-w-0">
          <span className="block truncate text-base font-medium text-fg">{s.title}</span>
          {s.place && <span className="block truncate text-xs text-fg-subtle">{s.place}</span>}
        </span>
      ),
      csv: (s) => s.title,
    },
    {
      key: "on_date", label: "When", width: "120px",
      render: (s) => <span className="tabular text-fg-muted">{fmtDay(s.on_date)}</span>,
      csv: (s) => s.on_date ?? "",
    },
    {
      key: "who", label: "Photographer", width: "minmax(0,0.9fr)", hideBelow: "md",
      render: (s) => <span className="truncate text-fg-muted">{s.photographer_id != null ? personName.get(s.photographer_id) ?? "—" : "—"}</span>,
      csv: (s) => (s.photographer_id != null ? personName.get(s.photographer_id) ?? "" : ""),
    },
    {
      key: "owner", label: "For", width: "minmax(0,0.9fr)", hideBelow: "lg", defaultHidden: true,
      render: (s) => (
        <span className="truncate text-fg-muted">
          {s.company_id != null ? companyName.get(s.company_id) ?? "—"
            : s.client_id != null ? clientName.get(s.client_id) ?? "—" : "—"}
        </span>
      ),
      csv: (s) => (s.company_id != null ? companyName.get(s.company_id) ?? "" : s.client_id != null ? clientName.get(s.client_id) ?? "" : ""),
    },
    {
      key: "consent", label: "Consent", width: "130px",
      render: (s) =>
        s.consent === true ? <span className="text-success">Given</span>
        : s.consent === false ? <span className="text-danger">Not given</span>
        : <span className="text-warn">Not recorded</span>,
      csv: (s) => (s.consent === true ? "given" : s.consent === false ? "not given" : "not recorded"),
    },
    {
      key: "assets", label: "Pictures", width: "90px", align: "right",
      render: (s) => <span className="tabular text-fg-muted">{s.assets}</span>,
      csv: (s) => s.assets,
    },
  ];

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        filters={rail}
        listKey="mkt_shoot"
        exportName="marketing-shoots"
        total={live.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search shoots…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-sm"
            />
            <span className="grow" />
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> New shoot
            </button>
          </div>
        }
        rowActions={(s) => (
          <form action={archiveShootAction}>
            <input type="hidden" name="id" value={s.id} />
            {s.archived && <input type="hidden" name="restore" value="on" />}
            <Button type="submit" size="xs" variant="ghost">{s.archived ? "Restore" : "Archive"}</Button>
          </form>
        )}
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-base font-medium text-fg-muted">No shoots yet.</p>
            <p className="max-w-[26rem] text-sm text-fg-subtle">
              A shoot groups a session&apos;s pictures. A one-off photo does not need one — it can go
              straight into the library.
            </p>
          </div>
        }
      />

      {adding && (
        <BottomSheet open onClose={() => setAdding(false)} title="New shoot">
          <form action={createShootAction} onSubmit={() => setAdding(false)} className="flex flex-col gap-3 px-1 pb-2">
            <Field label="What it was">
              <input name="title" className={FIELD} placeholder="Amber Rabdi on the marble slab" required autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="When"><input name="onDate" type="date" className={FIELD} /></Field>
              <Field label="Where"><input name="place" className={FIELD} placeholder="The kitchen" /></Field>
            </div>
            <Field label="Who shot it">
              <SelectField name="photographerId" placeholder="Not set"
                options={[{ value: "", label: "Not set" }, ...people.map((p) => ({ value: String(p.id), label: p.name }))]} />
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

            {/* ⚠️ Three-state, and never defaulted to yes. A photograph of an
                identifiable person is their personal information. */}
            <Field
              label="Did the people in it agree to be photographed?"
              hint="Leave it unanswered if nobody asked — that is a different fact from no."
            >
              <SelectField name="consent" placeholder="Nobody has said"
                options={[
                  { value: "", label: "Nobody has said" },
                  { value: "yes", label: "Yes — they agreed" },
                  { value: "no", label: "No" },
                ]} />
            </Field>

            <Field label="Notes">
              <Textarea name="notes" rows={2} placeholder="Anything worth remembering about the session." />
            </Field>

            <Button type="submit" variant="primary" className="mt-1 w-full">Add shoot</Button>
          </form>
        </BottomSheet>
      )}
    </>
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
