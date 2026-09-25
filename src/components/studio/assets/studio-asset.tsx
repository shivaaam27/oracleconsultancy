"use client";

/**
 * One asset, in Studio (26 Sept 2026) — who has it and since when, what it is
 * worth and whether it is still under warranty, every hand-over and every
 * service in one history, and the same hand-over / take-back / service sheets
 * as the register. Pure render plus the register's own actions.
 */
import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ban, CircleCheck, Eye, Pencil, Printer, Undo2, UserPlus, Users, Wrench, X } from "lucide-react";
import { StudioScope, StudioCardRow, StudioCard, CardHead, Ring, stBtn } from "@/components/studio/kit";
import { PersonFace } from "@/components/studio/face";
import { BackLink } from "@/components/shell/back-link";
import { useToast } from "@/components/shell/toast";
import { setAssetStatusAction, archiveAssetAction, checkAssetAction, removeAssetServiceAction } from "@/app/hrms/assets/actions";
import { ASSET_SERVICE_LABELS, checkedRecently, warrantyState, type AssetRow, type AssetHistoryRow, type AssetServiceRow } from "@/lib/operations/assets-shared";
import { AssetFormSheet, HandOverSheet, ReturnSheet, ServiceSheet, type AssetLists } from "./asset-sheets";
import { Pill, RowMenu, MenuItem, MenuLine, STATUS_DOT, STATUS_WORD, tzs, day, since, shortName } from "./bits";
import { cn } from "@/lib/cn";

type Sheet = "edit" | "hand" | "return" | "service" | null;
type Event =
  | { kind: "held"; at: string; h: AssetHistoryRow }
  | { kind: "service"; at: string; s: AssetServiceRow };

export function StudioAsset({ a, history, services, lists }: { a: AssetRow; history: AssetHistoryRow[]; services: AssetServiceRow[]; lists: AssetLists }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [now] = useState(() => Date.now());
  const close = () => setSheet(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { toast(r.error ?? "That did not work.", { tone: "warn" }); return; }
      toast(ok, { tone: "success" });
      router.refresh();
    });

  const w = warrantyState(a.warrantyUntil, now);
  const upkeep = services.reduce((s, x) => s + (x.cost ?? 0), 0);
  const seen = checkedRecently(a.checkedAt, now);
  const events: Event[] = [
    ...history.map((h) => ({ kind: "held" as const, at: h.assignedAt, h })),
    ...services.map((s) => ({ kind: "service" as const, at: s.happenedOn, s })),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  const warrantyLeft = a.warrantyUntil ? Math.round((new Date(a.warrantyUntil).getTime() - now) / 86_400_000) : null;
  const warrantySpan = a.warrantyUntil && a.purchaseDate ? Math.max(1, (new Date(a.warrantyUntil).getTime() - new Date(a.purchaseDate).getTime()) / 86_400_000) : 365;

  const primary =
    a.status === "in_store" ? <button type="button" onClick={() => setSheet("hand")} className={stBtn.dark}><UserPlus size={14} />Hand over</button>
    : a.status === "assigned" ? <button type="button" onClick={() => setSheet("return")} className={stBtn.dark}><Undo2 size={14} />Take back</button>
    : a.status === "maintenance" ? <button type="button" disabled={busy} onClick={() => act(() => setAssetStatusAction(a.id, "in_store"), "Back in the store.")} className={stBtn.dark}><CircleCheck size={14} />Back from the workshop</button>
    : null;

  return (
    <StudioScope className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <BackLink fallbackHref="/hrms/assets" fallbackLabel="Assets" className={cn(stBtn.chip, "self-start")} />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[30px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{a.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[var(--st-muted)]">
              <Pill dot={STATUS_DOT[a.status]}>{STATUS_WORD[a.status]}</Pill>
              {[a.category, a.tag, a.serialNo && `SN ${a.serialNo}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSheet("edit")} className={stBtn.ghost}><Pencil size={14} />Edit</button>
            {a.status !== "retired" && <button type="button" onClick={() => setSheet("service")} className={stBtn.ghost}><Wrench size={14} />Log a service</button>}
            {primary}
            <RowMenu>
              {(a.assignedToName || a.assignedToCompanyName) && <MenuItem onSelect={() => window.open(`/hrms/assets/${a.id}/receipt`, "_blank")} icon={<Printer size={14} />}>Handover receipt</MenuItem>}
              <MenuItem onSelect={() => act(() => checkAssetAction(a.id), "Marked as seen today.")} icon={<Eye size={14} />}>Seen it (stock-take)</MenuItem>
              <MenuLine />
              {a.status !== "maintenance" && a.status !== "retired" && <MenuItem onSelect={() => act(() => setAssetStatusAction(a.id, "maintenance"), "Sent to the workshop.")} icon={<Wrench size={14} />}>Send to the workshop</MenuItem>}
              {a.status === "retired"
                ? <MenuItem onSelect={() => act(() => setAssetStatusAction(a.id, "in_store"), "Back in service.")} icon={<ArchiveRestore size={14} />}>Bring back into service</MenuItem>
                : <MenuItem onSelect={() => act(() => setAssetStatusAction(a.id, "retired"), "Retired.")} icon={<Ban size={14} />}>Retire it</MenuItem>}
              <MenuItem onSelect={() => act(() => archiveAssetAction(a.id, true), "Archived.")} icon={<Archive size={14} />}>Archive</MenuItem>
            </RowMenu>
          </div>
        </div>
      </div>

      <StudioCardRow className="lg:h-[230px]">
        <StudioCard className="min-h-[210px]">
          <CardHead label={a.status === "assigned" ? "Held by" : "Where it is"} right={a.location ? <span>{a.location}</span> : undefined} />
          <div className="mt-auto flex items-end gap-4 pt-3">
            {a.assignedToName ? (
              <>
                <PersonFace name={a.assignedToName} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[26px] leading-tight tracking-[-0.02em]">{shortName(a.assignedToName)}</div>
                  <div className="mt-1 text-[13px] text-[var(--st-on-card-muted)]">{a.assignedAt ? `Since ${day(a.assignedAt)} · ${since(a.assignedAt, now)}` : "Handed over"}</div>
                </div>
                <button type="button" onClick={() => window.open(`/hrms/assets/${a.id}/receipt`, "_blank")} className={cn(stBtn.onCardGhost, "max-sm:hidden")}><Printer size={13} />Receipt</button>
              </>
            ) : a.assignedToCompanyName ? (
              <>
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--st-card-3)]"><Users size={22} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[26px] leading-tight tracking-[-0.02em]">{a.assignedToCompanyName}</div>
                  <div className="mt-1 text-[13px] text-[var(--st-on-card-muted)]">Shared{a.custodianName ? ` · looked after by ${shortName(a.custodianName)}` : ""}{a.assignedAt ? ` · since ${day(a.assignedAt)}` : ""}</div>
                </div>
              </>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="text-[30px] leading-tight tracking-[-0.02em]">{a.status === "maintenance" ? "In the workshop" : a.status === "retired" ? "Retired" : "In the store"}</div>
                <div className="mt-1 text-[13px] text-[var(--st-on-card-muted)]">
                  {a.status === "maintenance" ? (services[0] ? `Last work: ${ASSET_SERVICE_LABELS[services[0].kind].toLowerCase()} on ${day(services[0].happenedOn)}` : "Nothing logged yet — log what is being done.")
                    : a.status === "retired" ? "Out of use. Bring it back from the ⋯ menu."
                    : `Ready to hand out${a.location ? ` · ${a.location}` : ""}.`}
                </div>
                {a.status === "in_store" && <button type="button" onClick={() => setSheet("hand")} className={cn(stBtn.onCard, "mt-3")}><UserPlus size={13} />Hand over</button>}
              </div>
            )}
          </div>
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[210px]">
          <CardHead label="Value & care" right={a.companyName ? <span>{a.companyName}</span> : undefined} />
          <div className="mt-auto flex items-end gap-5 pt-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2"><span className="text-[44px] leading-[0.9] tracking-[-0.04em] tabular-nums">{a.purchaseCost ? tzs(a.purchaseCost, true) : "—"}</span><span className="text-sm text-[var(--st-on-card-muted)]">{a.purchaseCost ? "TZS paid" : "no price"}</span></div>
              <div className="mt-3 flex flex-col gap-0.5 text-xs text-[var(--st-on-card-muted)]">
                <span>{a.purchaseDate ? `Bought ${day(a.purchaseDate)} · ${since(a.purchaseDate, now)} old` : "Purchase date not recorded"}{a.vendorName ? ` · ${a.vendorName}` : ""}</span>
                <span>Upkeep so far TZS {tzs(upkeep)} · {services.length} job{services.length === 1 ? "" : "s"}</span>
                <span className={cn(!seen && "text-[#F29CC6]")}>{a.checkedAt ? `Last seen ${day(a.checkedAt)}` : "Never checked in a stock-take"}</span>
              </div>
            </div>
            <Ring value={warrantyLeft == null ? 0 : Math.max(0, Math.min(100, (warrantyLeft / warrantySpan) * 100))} size={112} stroke={12}
              color={w === "ended" ? "var(--st-late)" : w === "soon" ? "#F5A524" : "#19C37D"} track="var(--st-card-line)"
              label={warrantyLeft == null ? "—" : w === "ended" ? "Ended" : warrantyLeft} sub={warrantyLeft == null ? "no warranty" : w === "ended" ? day(a.warrantyUntil) : "days warranty"} />
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="grid grid-cols-1 items-start gap-4 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-[20px] bg-[var(--st-surface)] p-5">
          <h2 className="m-0 text-[15px] font-semibold">Details</h2>
          <dl className="m-0 mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <Row k="Category" v={a.category} />
            <Row k="Asset tag" v={a.tag} />
            <Row k="Brand" v={a.brand} />
            <Row k="Model" v={a.model} />
            <Row k="Serial number" v={a.serialNo} />
            <Row k="Department" v={a.department} />
            <Row k="Company" v={a.companyName && a.companyId ? <Link href={`/companies/${a.companyId}`} className="hover:underline">{a.companyName}</Link> : null} />
            <Row k="Where it lives" v={a.location} />
            <Row k="Bought from" v={a.vendorName && a.vendorId ? <Link href={`/hrms/vendors/${a.vendorId}`} className="hover:underline">{a.vendorName}</Link> : null} />
            <Row k="Bought on" v={a.purchaseDate ? day(a.purchaseDate) : null} />
            <Row k="Cost" v={a.purchaseCost ? `TZS ${tzs(a.purchaseCost)}` : null} />
            <Row k="Warranty until" v={a.warrantyUntil ? day(a.warrantyUntil) : null} />
          </dl>
          {a.notes && <p className="m-0 mt-3 whitespace-pre-wrap rounded-xl bg-[var(--st-page)] px-3.5 py-3 text-[13px]">{a.notes}</p>}
        </section>

        <section className="rounded-[20px] bg-[var(--st-surface)] p-5">
          <div className="flex items-baseline justify-between"><h2 className="m-0 text-[15px] font-semibold">History</h2><span className="text-xs text-[var(--st-muted)]">hand-overs and work done</span></div>
          {events.length === 0 && <p className="m-0 py-6 text-center text-[13px] text-[var(--st-muted)]">Nothing has happened to it yet.</p>}
          <ol className="m-0 mt-3 flex list-none flex-col p-0">
            {events.map((e) => (
              <li key={`${e.kind}-${e.kind === "held" ? e.h.id : e.s.id}`} className="group relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 pb-4 last:pb-0">
                <span className="relative flex justify-center">
                  <span className={cn("z-[1] mt-0.5 grid h-7 w-7 place-items-center rounded-full", e.kind === "held" ? "bg-[var(--st-page)]" : "bg-[#FFF4DF] text-[#A36A00]")}>{e.kind === "held" ? <UserPlus size={13} /> : <Wrench size={13} />}</span>
                  <span aria-hidden className="absolute bottom-[-2px] top-8 w-px bg-[var(--st-line)] group-last:hidden" />
                </span>
                {e.kind === "held" ? (
                  <div className="min-w-0 pt-1">
                    <div className="text-[13px]">
                      {e.h.personName ? <>Handed to <b className="font-medium">{shortName(e.h.personName)}</b></> : "Shared with a team"}
                    </div>
                    <div className="text-xs text-[var(--st-muted)]">{day(e.h.assignedAt)} → {e.h.returnedAt ? `back ${day(e.h.returnedAt)} · ${since(e.h.assignedAt, new Date(e.h.returnedAt).getTime())}` : "still has it"}{e.h.notes ? ` · ${e.h.notes}` : ""}</div>
                  </div>
                ) : (
                  <div className="min-w-0 pt-1">
                    <div className="text-[13px]"><b className="font-medium">{ASSET_SERVICE_LABELS[e.s.kind]}</b>{e.s.vendorName ? ` by ${e.s.vendorName}` : ""}{e.s.cost ? <span className="text-[var(--st-muted)]"> · TZS {tzs(e.s.cost)}</span> : null}</div>
                    <div className="text-xs text-[var(--st-muted)]">{day(e.s.happenedOn)}{e.s.notes ? ` · ${e.s.notes}` : ""}</div>
                  </div>
                )}
                {e.kind === "service" ? (
                  <button type="button" aria-label="Remove this entry" title="Remove this entry" disabled={busy}
                    onClick={() => act(() => removeAssetServiceAction(e.s.id), "Removed.")}
                    className="mt-1 grid h-7 w-7 place-items-center rounded-lg text-[var(--st-muted)] opacity-0 transition-opacity hover:bg-[var(--st-page)] hover:text-[var(--st-ink)] focus:opacity-100 group-hover:opacity-100"><X size={13} /></button>
                ) : <span />}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <AssetFormSheet open={sheet === "edit"} onClose={close} asset={a} lists={lists} />
      <HandOverSheet open={sheet === "hand"} onClose={close} asset={a} pool={[]} lists={lists} />
      <ReturnSheet open={sheet === "return"} onClose={close} asset={a} pool={[]} />
      <ServiceSheet open={sheet === "service"} onClose={close} asset={a} pool={[]} vendors={lists.vendors} />
    </StudioScope>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--st-line-soft)] py-2 text-[13px]">
      <dt className="shrink-0 text-[var(--st-muted)]">{k}</dt>
      <dd className={cn("m-0 min-w-0 truncate text-right", !v && "text-[var(--st-muted)]")}>{v || "—"}</dd>
    </div>
  );
}
