"use client";

/**
 * One supplier, in Studio (26 Sept 2026) — how to reach them, what we have
 * bought from them and what their upkeep work has cost, and their papers
 * (contracts, licences) with the same expiry tracking as every document.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, FilePlus, Mail, MessageCircle, Package, Pencil, Phone, Wrench } from "lucide-react";
import { StudioScope, StudioCardRow, StudioCard, CardHead, Ring, stBtn } from "@/components/studio/kit";
import { BackLink } from "@/components/shell/back-link";
import { useToast } from "@/components/shell/toast";
import { archiveVendorAction } from "@/app/hrms/vendors/actions";
import { ASSET_SERVICE_LABELS, type AssetRow, type AssetServiceRow } from "@/lib/operations/assets-shared";
import type { VendorRow } from "@/lib/operations/vendors-shared";
import type { VendorDocument } from "@/lib/operations/vendors";
import { VendorFormSheet, type Opt } from "./asset-sheets";
import { Pill, RowMenu, MenuItem, STATUS_DOT, STATUS_WORD, tzs, day } from "./bits";
import { cn } from "@/lib/cn";

const DOC_DOT: Record<string, string> = { Valid: "#19C37D", Expiring: "#F5A524", Expired: "var(--st-late)", "No expiry": "#B9BBBF", Archived: "#8E9197" };

export function StudioVendor({ v, assets, services, documents, companies }: {
  v: VendorRow; assets: AssetRow[]; services: AssetServiceRow[]; documents: VendorDocument[]; companies: Opt[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const bought = assets.reduce((s, a) => s + (a.purchaseCost ?? 0), 0);
  const upkeep = services.reduce((s, x) => s + (x.cost ?? 0), 0);
  const inDate = documents.filter((d) => d.status === "Valid" || d.status === "No expiry").length;
  const due = documents.filter((d) => d.status === "Expiring" || d.status === "Expired").length;
  const wa = v.phone ? v.phone.replace(/[^\d]/g, "") : "";
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast(`Copied ${t}`, { tone: "success" })).catch(() => toast(t));

  return (
    <StudioScope className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <BackLink fallbackHref="/hrms/assets?view=vendors" fallbackLabel="Suppliers" className={cn(stBtn.chip, "self-start")} />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[30px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{v.name}</h1>
            <div className="mt-2 text-[13px] text-[var(--st-muted)]">{[v.category ?? "Supplier", v.companyName ?? "Every company", v.location].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setEdit(true)} className={stBtn.ghost}><Pencil size={14} />Edit</button>
            <Link href="/files" className={stBtn.ghost}><FilePlus size={14} />File a paper</Link>
            <RowMenu>
              <MenuItem onSelect={() => start(async () => {
                const r = await archiveVendorAction(v.id);
                if (!r.ok) { toast(r.error, { tone: "warn" }); return; }
                toast(`${v.name} archived.`, { tone: "success" });
                router.push("/hrms/assets?view=vendors");
              })} icon={<Archive size={14} />}>{busy ? "Archiving…" : "Archive"}</MenuItem>
            </RowMenu>
          </div>
        </div>
      </div>

      <StudioCardRow className="lg:h-[220px]">
        <StudioCard className="min-h-[200px]">
          <CardHead label="Contact" right={v.email ? <span className="truncate">{v.email}</span> : undefined} />
          <div className="mt-auto flex flex-col gap-3 pt-3">
            <div>
              <div className="truncate text-[28px] leading-tight tracking-[-0.02em]">{v.contactName ?? "No contact person"}</div>
              <div className="mt-1 text-[13px] text-[var(--st-on-card-muted)]">{v.phone ?? "No phone"}{v.email ? ` · ${v.email}` : ""}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {v.phone && <a href={`tel:${v.phone}`} className={stBtn.onCard}><Phone size={13} />Call</a>}
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={stBtn.onCardGhost}><MessageCircle size={13} />WhatsApp</a>}
              {v.email && <a href={`mailto:${v.email}`} className={stBtn.onCardGhost}><Mail size={13} />Email</a>}
              {(v.phone || v.email) && <button type="button" onClick={() => copy(v.phone ?? v.email!)} className={stBtn.onCardGhost}><Copy size={13} />Copy</button>}
            </div>
          </div>
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[200px]">
          <CardHead label="Business with them" right={<span>all time</span>} />
          <div className="mt-auto flex items-end gap-5 pt-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2"><span className="text-[44px] leading-[0.9] tracking-[-0.04em] tabular-nums">{tzs(bought + upkeep, true)}</span><span className="text-sm text-[var(--st-on-card-muted)]">TZS</span></div>
              <div className="mt-3 flex flex-col gap-0.5 text-xs text-[var(--st-on-card-muted)]">
                <span>{assets.length} asset{assets.length === 1 ? "" : "s"} bought · TZS {tzs(bought)}</span>
                <span>{services.length} job{services.length === 1 ? "" : "s"} done · TZS {tzs(upkeep)}</span>
              </div>
            </div>
            <Ring value={documents.length ? (inDate / documents.length) * 100 : 0} size={108} stroke={12} color={due ? "#F5A524" : "#19C37D"} track="var(--st-card-line)"
              label={documents.length ? `${inDate}/${documents.length}` : "—"} sub={documents.length ? (due ? `${due} due` : "papers in date") : "no papers"} />
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="grid grid-cols-1 items-start gap-4 pb-10 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Papers" note="contracts, licences, quotes">
          {documents.length === 0 && <EmptyLine>None filed. Put their contract in Files and choose this supplier.</EmptyLine>}
          {documents.map((d) => (
            <Link key={d.id} href={`/files?open=${d.id}`} className="flex items-center gap-2 rounded-lg px-1 py-2 text-[13px] hover:bg-[var(--st-page)]">
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              <Pill dot={DOC_DOT[d.status]}>{d.expiryLabel ?? d.status}</Pill>
            </Link>
          ))}
        </Panel>
        <Panel title="Bought from them" note={`${assets.length}`}>
          {assets.length === 0 && <EmptyLine>No asset records this supplier yet.</EmptyLine>}
          {assets.map((a) => (
            <Link key={a.id} href={`/hrms/assets/${a.id}`} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1 py-2 text-[13px] hover:bg-[var(--st-page)]">
              <Package size={14} className="text-[var(--st-muted)]" />
              <span className="min-w-0 truncate">{a.name}<span className="text-[var(--st-muted)]">{a.purchaseDate ? ` · ${day(a.purchaseDate)}` : ""}</span></span>
              <Pill dot={STATUS_DOT[a.status]}>{STATUS_WORD[a.status]}</Pill>
            </Link>
          ))}
        </Panel>
        <Panel title="Work they did" note={services.length ? `TZS ${tzs(upkeep)}` : undefined}>
          {services.length === 0 && <EmptyLine>No service or repair logged against them.</EmptyLine>}
          {services.map((s) => (
            <Link key={s.id} href={`/hrms/assets/${s.assetId}`} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1 py-2 text-[13px] hover:bg-[var(--st-page)]">
              <Wrench size={14} className="text-[var(--st-muted)]" />
              <span className="min-w-0 truncate">{ASSET_SERVICE_LABELS[s.kind]}{s.notes ? <span className="text-[var(--st-muted)]"> · {s.notes}</span> : null}</span>
              <span className="text-xs tabular-nums text-[var(--st-muted)]">{day(s.happenedOn)}{s.cost ? ` · ${tzs(s.cost, true)}` : ""}</span>
            </Link>
          ))}
        </Panel>
        {v.notes && (
          <Panel title="Notes"><p className="m-0 whitespace-pre-wrap text-[13px]">{v.notes}</p></Panel>
        )}
      </div>

      <VendorFormSheet open={edit} onClose={() => setEdit(false)} vendor={v} companies={companies} />
    </StudioScope>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] bg-[var(--st-surface)] p-5">
      <div className="flex items-baseline justify-between"><h2 className="m-0 text-[15px] font-semibold">{title}</h2>{note && <span className="text-xs text-[var(--st-muted)]">{note}</span>}</div>
      <div className="mt-2 flex max-h-[420px] flex-col overflow-y-auto">{children}</div>
    </section>
  );
}
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-4 text-center text-[13px] text-[var(--st-muted)]">{children}</p>;
}
