"use client";

/**
 * Assets, Tools & Vendors in Studio (26 Sept 2026, mockup board Assets) — run
 * as a management system, not a list: the equipment card and the hand-over
 * desk on top, a "needs attention" strip (the workshop, warranties ending, the
 * stock-take, value and upkeep) that filters the list, then the three
 * registers. Tools are grouped by site with low stock flagged; suppliers carry
 * what they sold us, what their upkeep cost and whether their papers are in
 * date.
 *
 * Filters are the address (useUrlFilters) so a filtered view survives Back and
 * a reload. Every write is one of the register's own server actions.
 */
import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive, ArchiveRestore, ArrowRightLeft, Ban, Check, Eye, FileText, FileUp, Loader2, Minus, Package, Pencil, Phone, Plus, Printer, Search,
  ShieldAlert, Undo2, UserPlus, Users, Wrench, Copy, CircleCheck,
} from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber, Ring, stBtn, stFloatBar } from "@/components/studio/kit";
import { StudioMenu } from "@/components/studio/tasks/controls";
import { PersonFace } from "@/components/studio/face";
import { useToast } from "@/components/toast";
import { useUrlFilters } from "@/lib/use-url-filters";
import { useCreateParam } from "@/lib/use-create-param";
import { withReturn } from "@/lib/return-to";
import { setAssetStatusAction, archiveAssetAction, checkAssetAction } from "@/app/hrms/assets/actions";
import { setSiteToolQuantityAction, setSiteToolConditionAction, archiveSiteToolAction } from "@/app/hrms/assets/site-tools-actions";
import { archiveVendorAction } from "@/app/hrms/vendors/actions";
import { checkedRecently, warrantyState, type AssetRow, type AssetStatus } from "@/lib/assets-shared";
import { isLowStock, TOOL_CONDITION_LABELS, type SiteToolRow } from "@/lib/site-tools-shared";
import type { VendorRow } from "@/lib/vendors-shared";
import {
  AssetFormSheet, HandOverSheet, ReturnSheet, ServiceSheet, ToolFormSheet, ToolMoveSheet, VendorFormSheet, ImportSheet, type AssetLists,
} from "./asset-sheets";
import { Pill, RowMenu, MenuItem, MenuLine, STATUS_DOT, STATUS_WORD, CONDITION_DOT, tzs, since, shortName } from "./bits";
import { cn } from "@/lib/cn";

export type View = "assets" | "tools" | "vendors";
export type StudioAssetsData = {
  view: View;
  archived: boolean;
  assets: AssetRow[];
  tools: SiteToolRow[];
  vendors: VendorRow[];
  lists: AssetLists;
  vendorAssets: Record<number, number>;
  /** Bought (asset cost) + upkeep (every service logged), per supplier. */
  vendorSpend: Record<number, number>;
  upkeepYear: number;
  servicesYear: number;
  /** When each asset was last worked on (latest service). */
  lastService: Record<number, string>;
};

const DEFAULTS = { co: "", cat: "", st: "", flag: "", site: "", cond: "", kind: "", q: "" };

type Sheet =
  | { k: "asset"; a: AssetRow | null } | { k: "hand"; a: AssetRow | null } | { k: "return"; a: AssetRow | null } | { k: "service"; a: AssetRow | null }
  | { k: "tool"; t: SiteToolRow | null } | { k: "move"; t: SiteToolRow; start: "count" | "move" | "writeoff" }
  | { k: "vendor"; v: VendorRow | null } | { k: "import"; what: "assets" | "tools" } | null;

export function StudioAssets({ d }: { d: StudioAssetsData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const f = useUrlFilters(DEFAULTS, { debounceKeys: ["q"] });
  const v = f.values;
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const view = d.view;
  const sp = useSearchParams();
  const here = `/hrms/assets${sp.toString() ? `?${sp.toString()}` : ""}`;
  const [now] = useState(() => Date.now());

  useCreateParam("asset", () => setSheet({ k: "asset", a: null }));
  useCreateParam("tool", () => setSheet({ k: "tool", t: null }));
  useCreateParam("vendor", () => setSheet({ k: "vendor", v: null }));

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { toast(r.error ?? "That did not work.", { tone: "warn" }); return; }
      toast(ok, { tone: "success" });
      router.refresh();
    });

  const viewHref = (to: View) => `/hrms/assets${to === "assets" ? "" : `?view=${to}`}`;
  const q = v.q.trim().toLowerCase();

  /* ---------------- assets ---------------- */
  const live = d.assets;
  const aStats = useMemo(() => {
    const active = live.filter((a) => a.status !== "retired");
    return {
      total: live.length,
      out: live.filter((a) => a.status === "assigned").length,
      store: live.filter((a) => a.status === "in_store").length,
      workshop: live.filter((a) => a.status === "maintenance").length,
      warranty: live.filter((a) => { const w = warrantyState(a.warrantyUntil, now); return w === "soon" || (w === "ended" && a.status !== "retired" && (now - new Date(a.warrantyUntil!).getTime()) < 30 * 86_400_000); }).length,
      unchecked: active.filter((a) => !checkedRecently(a.checkedAt, now)).length,
      value: live.reduce((s, a) => s + (a.purchaseCost ?? 0), 0),
    };
  }, [live, now]);
  const assets = useMemo(() => live.filter((a) => {
    if (v.co && String(a.companyId ?? "") !== v.co) return false;
    if (v.cat && (a.category ?? "") !== v.cat) return false;
    if (v.st && !d.archived && a.status !== v.st) return false;
    if (v.flag === "warranty") { const w = warrantyState(a.warrantyUntil, now); if (w !== "soon" && w !== "ended") return false; }
    if (v.flag === "unchecked" && (a.status === "retired" || checkedRecently(a.checkedAt, now))) return false;
    if (q && !`${a.name} ${a.tag ?? ""} ${a.serialNo ?? ""} ${a.brand ?? ""} ${a.model ?? ""} ${a.assignedToName ?? ""} ${a.assignedToCompanyName ?? ""} ${a.location ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }), [live, v.co, v.cat, v.st, v.flag, q, now, d.archived]);

  /* ---------------- tools ---------------- */
  const tStats = useMemo(() => {
    const sites = new Map<string, { units: number; lines: number; low: number }>();
    for (const t of d.tools) {
      const k = t.location ?? "No site";
      const e = sites.get(k) ?? { units: 0, lines: 0, low: 0 };
      e.units += t.quantity; e.lines++; if (isLowStock(t)) e.low++;
      sites.set(k, e);
    }
    return {
      units: d.tools.reduce((s, t) => s + t.quantity, 0),
      lines: d.tools.length,
      low: d.tools.filter(isLowStock).length,
      repair: d.tools.filter((t) => t.condition === "needs_repair").length,
      good: d.tools.filter((t) => t.condition === "good").length,
      sites: [...sites.entries()].sort((a, b) => b[1].units - a[1].units),
    };
  }, [d.tools]);
  const tools = useMemo(() => d.tools.filter((t) => {
    if (v.co && String(t.companyId ?? "") !== v.co) return false;
    if (v.site && (t.location ?? "No site") !== v.site) return false;
    if (v.cond === "low" ? !isLowStock(t) : v.cond && t.condition !== v.cond) return false;
    if (q && !`${t.name} ${t.specification ?? ""} ${t.location ?? ""} ${t.remark ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }), [d.tools, v.co, v.site, v.cond, q]);
  const toolGroups = useMemo(() => {
    const g = new Map<string, SiteToolRow[]>();
    for (const t of tools) { const k = t.location ?? "No site"; g.set(k, [...(g.get(k) ?? []), t]); }
    return [...g.entries()];
  }, [tools]);

  /* ---------------- vendors ---------------- */
  const vendors = useMemo(() => d.vendors.filter((x) => {
    if (v.co && String(x.companyId ?? "") !== v.co) return false;
    if (v.kind && (x.category ?? "") !== v.kind) return false;
    if (q && !`${x.name} ${x.contactName ?? ""} ${x.phone ?? ""} ${x.email ?? ""} ${x.location ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }), [d.vendors, v.co, v.kind, q]);
  const vStats = useMemo(() => ({
    withPapers: d.vendors.filter((x) => x.docCount > 0).length,
    expiring: d.vendors.reduce((s, x) => s + x.expiringCount + x.expiredCount, 0),
    top: [...d.vendors].map((x) => ({ x, n: d.vendorSpend[x.id] ?? 0 })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 5),
  }), [d.vendors, d.vendorSpend]);

  /* ---------------- header menus ---------------- */
  const opt = (key: keyof typeof DEFAULTS, value: string, label: string, count?: number) => ({ key: `${key}-${value || "all"}`, label, count, href: f.hrefFor({ [key]: value }), active: v[key] === value });
  const companiesUsed = (ids: (number | null)[]) => d.lists.companies.filter((c) => ids.includes(c.id));
  const coMenu = (ids: (number | null)[]) => {
    const cs = companiesUsed(ids);
    const cur = cs.find((c) => String(c.id) === v.co);
    return <StudioMenu label={cur?.name ?? "All companies"} searchable={cs.length > 8} options={[opt("co", "", "All companies"), ...cs.map((c) => opt("co", String(c.id), c.name, ids.filter((i) => i === c.id).length))]} />;
  };
  const left: ReactNode = view === "assets" ? (
    <>
      {coMenu(live.map((a) => a.companyId))}
      <StudioMenu label={v.cat || "All categories"} searchable options={[opt("cat", "", "All categories"), ...[...new Set(live.map((a) => a.category).filter(Boolean) as string[])].sort().map((c) => opt("cat", c, c, live.filter((a) => a.category === c).length))]} />
      <StudioMenu label={d.archived ? "Archived" : v.st ? STATUS_WORD[v.st as AssetStatus] : "All statuses"} options={[
        { key: "st-all", label: "All statuses", href: f.hrefFor({ st: "" }), active: !v.st && !d.archived },
        ...(["in_store", "assigned", "maintenance", "retired"] as AssetStatus[]).map((s) => opt("st", s, STATUS_WORD[s], live.filter((a) => a.status === s).length)),
        { key: "st-archived", label: "Archived", href: f.hrefFor({ st: "archived" }), active: d.archived },
      ]} />
    </>
  ) : view === "tools" ? (
    <>
      {coMenu(d.tools.map((t) => t.companyId))}
      <StudioMenu label={v.site || "All sites"} searchable={tStats.sites.length > 8} options={[opt("site", "", "All sites"), ...tStats.sites.map(([s, e]) => opt("site", s, s, e.lines))]} />
      <StudioMenu label={v.cond === "low" ? "Low stock" : v.cond ? TOOL_CONDITION_LABELS[v.cond as keyof typeof TOOL_CONDITION_LABELS] : "Any condition"} options={[
        opt("cond", "", "Any condition"), opt("cond", "low", "Low stock", tStats.low), opt("cond", "good", "Good", tStats.good), opt("cond", "needs_repair", "Needs repair", tStats.repair), opt("cond", "retired", "Retired"),
      ]} />
    </>
  ) : (
    <>
      {coMenu(d.vendors.map((x) => x.companyId))}
      <StudioMenu label={v.kind || "Every kind"} options={[opt("kind", "", "Every kind"), ...[...new Set(d.vendors.map((x) => x.category).filter(Boolean) as string[])].sort().map((k) => opt("kind", k, k, d.vendors.filter((x) => x.category === k).length))]} />
    </>
  );

  const seg = (
    <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
      {([["assets", "Assets", d.assets.length], ["tools", "Tools", d.tools.length], ["vendors", "Suppliers", d.vendors.length]] as const).map(([k, l, n]) => (
        <Link key={k} href={viewHref(k)} role="tab" aria-selected={view === k} scroll={false}
          className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors", view === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
          {l}<span className="text-[11px] font-normal text-[var(--st-muted)]">{n}</span>
        </Link>
      ))}
    </div>
  );
  const add = view === "assets" ? () => setSheet({ k: "asset", a: null }) : view === "tools" ? () => setSheet({ k: "tool", t: null }) : () => setSheet({ k: "vendor", v: null });

  const inStore = live.filter((a) => a.status === "in_store");
  const handedOut = live.filter((a) => a.status === "assigned");
  const workable = live.filter((a) => a.status !== "retired");

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title={view === "assets" ? "Assets" : view === "tools" ? "Tools" : "Suppliers"}
        left={left}
        right={
          <>
            {seg}
            {view !== "vendors" && <button type="button" onClick={() => setSheet({ k: "import", what: view })} className={cn(stBtn.ghost, "max-sm:hidden")}><FileUp size={14} />Import</button>}
            {view !== "vendors" && <Link href="/hrms/assets/print" target="_blank" className={cn(stBtn.ghost, "max-sm:hidden")}><Printer size={14} />Print register</Link>}
            <button type="button" onClick={add} aria-label={view === "assets" ? "Add asset" : view === "tools" ? "Add tools" : "Add supplier"} className={cn(stBtn.dark, "max-sm:w-9 max-sm:justify-center max-sm:px-0")}><Plus size={15} /><span className="max-sm:hidden">{view === "assets" ? "Add asset" : view === "tools" ? "Add tools" : "Add supplier"}</span></button>
          </>
        }
      />

      {view === "assets" && (
        <>
          <StudioCardRow className="lg:h-[220px]">
            <StudioCard className="min-h-[210px]">
              <CardHead label="Equipment" right={<span>{v.co ? d.lists.companies.find((c) => String(c.id) === v.co)?.name : "across every company"}</span>} />
              <div className="mt-auto flex items-end gap-5 pt-3 sm:gap-7">
                <div className="min-w-0">
                  <BigNumber value={aStats.total} unit="assets" />
                  <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[var(--st-on-card-muted)]">
                    <span>{tzs(tStats.units)} tool units</span><span>{tStats.low} low stock</span><span>{d.vendors.length} suppliers</span>
                  </div>
                </div>
                <span className="flex-1" />
                <span className="max-sm:hidden"><Ring value={aStats.total ? (aStats.out / aStats.total) * 100 : 0} size={112} stroke={12} color="#F2F2F0" track="var(--st-card-line)" label={aStats.out} sub="handed out" /></span>
                <Ring value={aStats.total ? (aStats.store / aStats.total) * 100 : 0} size={112} stroke={12} color="#19C37D" track="var(--st-card-line)" label={aStats.store} sub="in store" />
              </div>
            </StudioCard>
            <StudioCard texture="hatch" className="min-h-[210px]">
              <CardHead label="Hand-over desk" right={<span>{aStats.store} ready to hand out</span>} />
              <div className="mt-auto grid grid-cols-2 gap-2 pt-3 sm:grid-cols-4">
                <DeskTile icon={<UserPlus size={18} />} title="Hand over" sub="to a person or a team" onClick={() => setSheet({ k: "hand", a: null })} disabled={!inStore.length} />
                <DeskTile icon={<Undo2 size={18} />} title="Take back" sub="auto on leaving" onClick={() => setSheet({ k: "return", a: null })} disabled={!handedOut.length} />
                <DeskTile icon={<Wrench size={18} />} title="Log a service" sub="repair or inspection" onClick={() => setSheet({ k: "service", a: null })} disabled={!workable.length} />
                <DeskTile icon={<Eye size={18} />} title="Stock-take" sub={`${aStats.unchecked} to see`} href={f.hrefFor({ flag: v.flag === "unchecked" ? "" : "unchecked", st: "" })} on={v.flag === "unchecked"} />
              </div>
            </StudioCard>
          </StudioCardRow>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="In the workshop" value={aStats.workshop} tone={aStats.workshop ? "warn" : undefined} href={f.hrefFor({ st: v.st === "maintenance" ? "" : "maintenance", flag: "" })} on={v.st === "maintenance"} />
            <Stat label="Warranty ending" value={aStats.warranty} tone={aStats.warranty ? "late" : undefined} href={f.hrefFor({ flag: v.flag === "warranty" ? "" : "warranty", st: "" })} on={v.flag === "warranty"} sub="within 60 days" />
            <Stat label="Not seen in 6 months" value={aStats.unchecked} href={f.hrefFor({ flag: v.flag === "unchecked" ? "" : "unchecked", st: "" })} on={v.flag === "unchecked"} sub="stock-take" />
            <Stat label="Bought for" value={`TZS ${tzs(aStats.value, true)}`} sub={`${live.filter((a) => a.purchaseCost).length} with a price`} />
            <Stat label="Upkeep, last 12 months" value={`TZS ${tzs(d.upkeepYear, true)}`} sub={`${d.servicesYear} job${d.servicesYear === 1 ? "" : "s"} logged`} className="max-lg:col-span-2 max-sm:col-span-2" />
          </div>

          <div className="flex flex-col gap-2 pb-24">
            {v.flag === "unchecked" && (
              <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-[var(--st-surface)] px-5 py-3 text-[13px]">
                <Eye size={15} className="text-[var(--st-muted)]" />
                <span><b className="font-medium">Stock-take.</b> Walk round and press <b className="font-medium">Seen it</b> for each one you find. Anything left here needs looking for.</span>
                <Link href={f.hrefFor({ flag: "" })} scroll={false} className="ml-auto text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">Finish</Link>
              </div>
            )}
            <div className="hidden grid-cols-[minmax(0,1.6fr)_140px_190px_140px_100px_32px] gap-x-[18px] px-5 text-xs text-[var(--st-muted)] md:grid">
              <span>Asset</span><span>Category</span><span>Held by</span><span>Status</span><span /><span />
            </div>
            {assets.length === 0 && <Empty>{q ? "No asset matches that." : d.archived ? "Nothing archived." : v.flag === "unchecked" ? "Everything has been seen in the last six months." : "No assets here."}</Empty>}
            {assets.map((a) => {
              const w = warrantyState(a.warrantyUntil, now);
              const sub = [a.tag, a.serialNo && `SN ${a.serialNo}`, a.companyName ?? "No company", a.location].filter(Boolean).join(" · ");
              const open = withReturn(`/hrms/assets/${a.id}`, here);
              return (
                <div key={a.id} className="group grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-x-3 rounded-[14px] bg-[var(--st-surface)] px-5 py-3 transition-shadow hover:shadow-[0_4px_14px_rgba(17,18,20,0.06)] md:grid-cols-[minmax(0,1.6fr)_140px_190px_140px_100px_32px] md:gap-x-[18px]">
                  <Link href={open} className="min-w-0 md:contents">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">{a.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--st-muted)]">{sub}</span>
                    </span>
                    <span className={cn("hidden truncate text-[13px] md:block", !a.category && "text-[var(--st-muted)]")}>{a.category ?? "Not set"}</span>
                    <span className="hidden min-w-0 items-center gap-2 md:flex">
                      {a.assignedToName ? <><PersonFace name={a.assignedToName} size={24} /><span className="truncate text-[13px]">{shortName(a.assignedToName)}</span></>
                        : a.assignedToCompanyName ? <><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--st-page)]"><Users size={12} /></span><span className="truncate text-[13px]">{a.assignedToCompanyName}{a.custodianName ? <span className="text-[var(--st-muted)]"> · {shortName(a.custodianName).split(" ")[0]}</span> : null}</span></>
                        : <span className="text-[13px] text-[var(--st-muted)]">Nobody</span>}
                    </span>
                    <span className="hidden items-center gap-1.5 md:flex">
                      <Pill dot={STATUS_DOT[a.status]}>{STATUS_WORD[a.status]}</Pill>
                      {(w === "soon" || w === "ended") && a.status !== "retired" && <span title={w === "ended" ? "Warranty ended" : "Warranty ending soon"} className="text-[var(--st-late-text)]"><ShieldAlert size={14} /></span>}
                    </span>
                  </Link>
                  <span className="md:hidden"><Pill dot={STATUS_DOT[a.status]}>{STATUS_WORD[a.status]}</Pill></span>
                  <span className="hidden md:block">
                    {v.flag === "unchecked" ? (
                      <RowBtn onClick={() => act(() => checkAssetAction(a.id), `${a.name} seen.`)} disabled={busy}><Check size={13} />Seen it</RowBtn>
                    ) : a.status === "in_store" ? (
                      <RowBtn onClick={() => setSheet({ k: "hand", a })}>Hand over</RowBtn>
                    ) : a.status === "assigned" ? (
                      <RowBtn onClick={() => setSheet({ k: "return", a })}>Take back</RowBtn>
                    ) : a.status === "maintenance" ? (
                      <RowBtn onClick={() => setSheet({ k: "service", a })}>Log work</RowBtn>
                    ) : null}
                  </span>
                  <AssetMenu a={a} d={d} setSheet={setSheet} act={act} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "tools" && (
        <>
          <StudioCardRow className="lg:h-[220px]">
            <StudioCard className="min-h-[210px]">
              <CardHead label="Site tools" right={<span>{tStats.lines} kinds · {tStats.sites.length} site{tStats.sites.length === 1 ? "" : "s"}</span>} />
              <div className="mt-auto flex items-end gap-5 pt-3 sm:gap-7">
                <div className="min-w-0">
                  <BigNumber value={tzs(tStats.units)} unit="units" />
                  <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[var(--st-on-card-muted)]">
                    <span>{tStats.repair} need repair</span><span>{tStats.low} low stock</span>
                  </div>
                </div>
                <span className="flex-1" />
                <span className="max-sm:hidden"><Ring value={tStats.lines ? (tStats.good / tStats.lines) * 100 : 0} size={112} stroke={12} color="#19C37D" track="var(--st-card-line)" label={`${tStats.lines ? Math.round((tStats.good / tStats.lines) * 100) : 0}%`} sub="in good order" /></span>
                <Link href={f.hrefFor({ cond: v.cond === "low" ? "" : "low" })} scroll={false} className="rounded-full hover:opacity-90">
                  <Ring value={tStats.lines ? Math.max(tStats.low ? 8 : 0, (tStats.low / tStats.lines) * 100) : 0} size={112} stroke={12} color="var(--st-late)" track="var(--st-card-line)" label={tStats.low} sub="low stock" />
                </Link>
              </div>
            </StudioCard>
            <StudioCard texture="hatch" className="min-h-[210px]">
              <CardHead label="By site" right={<span>units held</span>} />
              <div className="mt-auto flex flex-col gap-1.5 pt-3">
                {tStats.sites.length === 0 && <div className="text-[13px] text-[var(--st-on-card-muted)]">No tools recorded yet.</div>}
                {tStats.sites.slice(0, 5).map(([s, e]) => (
                  <Link key={s} href={f.hrefFor({ site: v.site === s ? "" : s })} scroll={false} className={cn("grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_60px_40px] items-center gap-2.5 rounded-lg px-1 py-[3px] text-xs hover:bg-[var(--st-card-2)]", v.site === s && "bg-[var(--st-card-2)]")}>
                    <span className="truncate">{s}</span>
                    <span className="h-2 overflow-hidden rounded-[4px] bg-[var(--st-card-3)]"><span className="block h-full rounded-[4px] bg-[#F2F2F0]" style={{ width: `${(e.units / Math.max(1, tStats.sites[0][1].units)) * 100}%` }} /></span>
                    <span className="text-[11px] text-[#F29CC6]">{e.low ? `${e.low} low` : ""}</span>
                    <span className="text-right tabular-nums">{tzs(e.units)}</span>
                  </Link>
                ))}
                {tStats.sites.length > 5 && <div className="px-1 text-[11px] text-[var(--st-on-card-muted)]">and {tStats.sites.length - 5} more — pick one from “All sites”.</div>}
              </div>
            </StudioCard>
          </StudioCardRow>

          <div className="flex flex-col gap-2 pb-24">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_150px_130px_130px_120px_32px] gap-x-[18px] px-5 text-xs text-[var(--st-muted)] md:grid">
              <span>Tool</span><span>Company</span><span>Count</span><span>Condition</span><span /><span />
            </div>
            {tools.length === 0 && <Empty>{q ? "No tool matches that." : "No tools here."}</Empty>}
            {toolGroups.map(([site, rows]) => (
              <div key={site} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2 px-1 pt-2 text-[13px]"><span className="font-semibold">{site}</span><span className="text-xs text-[var(--st-muted)]">{rows.length} kind{rows.length === 1 ? "" : "s"} · {tzs(rows.reduce((s, t) => s + t.quantity, 0))} units</span></div>
                {rows.map((t) => {
                  const low = isLowStock(t);
                  return (
                    <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-x-3 rounded-[14px] bg-[var(--st-surface)] px-5 py-3 md:grid-cols-[minmax(0,1.6fr)_150px_130px_130px_120px_32px] md:gap-x-[18px]">
                      <button type="button" onClick={() => setSheet({ k: "move", t, start: "count" })} className="min-w-0 text-left">
                        <span className="block truncate text-[15px] font-medium">{t.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--st-muted)]">{[t.specification, t.remark].filter(Boolean).join(" · ") || "No specification"}</span>
                      </button>
                      <span className={cn("hidden truncate text-[13px] md:block", !t.companyName && "text-[var(--st-muted)]")}>{t.companyName ?? "No company"}</span>
                      <span className="flex items-baseline gap-1.5 max-md:justify-end">
                        <span className={cn("text-[20px] leading-none tracking-[-0.02em] tabular-nums", low && "text-[var(--st-late-text)]")}>{t.quantity}</span>
                        {t.minQty > 0 && <span className={cn("text-[11px]", low ? "text-[var(--st-late-text)]" : "text-[var(--st-muted)]")}>{low ? "low" : `min ${t.minQty}`}</span>}
                      </span>
                      <span className="hidden md:block"><Pill dot={CONDITION_DOT[t.condition]}>{TOOL_CONDITION_LABELS[t.condition]}</Pill></span>
                      <span className="hidden items-center gap-1 md:flex">
                        <Step label="One fewer" disabled={busy || t.quantity <= 0} onClick={() => act(() => setSiteToolQuantityAction(t.id, t.quantity - 1), `${t.name}: ${t.quantity - 1}.`)}><Minus size={13} /></Step>
                        <Step label="One more" disabled={busy} onClick={() => act(() => setSiteToolQuantityAction(t.id, t.quantity + 1), `${t.name}: ${t.quantity + 1}.`)}><Plus size={13} /></Step>
                      </span>
                      <RowMenu>
                        <MenuItem onSelect={() => setSheet({ k: "move", t, start: "count" })} icon={<Pencil size={14} />}>Count them</MenuItem>
                        <MenuItem onSelect={() => setSheet({ k: "move", t, start: "move" })} icon={<ArrowRightLeft size={14} />}>Move some to a site</MenuItem>
                        <MenuItem onSelect={() => setSheet({ k: "move", t, start: "writeoff" })} icon={<Ban size={14} />}>Write some off</MenuItem>
                        <MenuLine />
                        {t.condition !== "needs_repair" && <MenuItem onSelect={() => act(() => setSiteToolConditionAction(t.id, "needs_repair"), "Marked for repair.")} icon={<Wrench size={14} />}>Needs repair</MenuItem>}
                        {t.condition !== "good" && <MenuItem onSelect={() => act(() => setSiteToolConditionAction(t.id, "good"), "Back in good order.")} icon={<CircleCheck size={14} />}>In good order</MenuItem>}
                        <MenuItem onSelect={() => setSheet({ k: "tool", t })} icon={<Pencil size={14} />}>Edit details</MenuItem>
                        <MenuItem onSelect={() => act(() => archiveSiteToolAction(t.id, true), "Archived.")} icon={<Archive size={14} />}>Archive</MenuItem>
                      </RowMenu>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {view === "vendors" && (
        <>
          <StudioCardRow className="lg:h-[220px]">
            <StudioCard className="min-h-[210px]">
              <CardHead label="Suppliers" right={<span>contractors, landlords, services</span>} />
              <div className="mt-auto flex items-end gap-5 pt-3 sm:gap-7">
                <div className="min-w-0">
                  <BigNumber value={d.vendors.length} unit="suppliers" />
                  <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[var(--st-on-card-muted)]">
                    <span>{Object.values(d.vendorAssets).reduce((s, n) => s + n, 0)} assets bought from them</span>
                  </div>
                </div>
                <span className="flex-1" />
                <span className="max-sm:hidden"><Ring value={d.vendors.length ? (vStats.withPapers / d.vendors.length) * 100 : 0} size={112} stroke={12} color="#F2F2F0" track="var(--st-card-line)" label={vStats.withPapers} sub="papers on file" /></span>
                <Ring value={vStats.expiring ? 100 : 0} size={112} stroke={12} color={vStats.expiring ? "var(--st-late)" : "#19C37D"} track="var(--st-card-line)" label={vStats.expiring} sub="papers due" />
              </div>
            </StudioCard>
            <StudioCard texture="hatch" className="min-h-[210px]">
              <CardHead label="Where the money goes" right={<span>bought + upkeep</span>} />
              <div className="mt-auto flex flex-col gap-1.5 pt-3">
                {vStats.top.length === 0 && <div className="text-[13px] text-[var(--st-on-card-muted)]">Record who an asset was bought from, or who serviced it, and the spend shows here.</div>}
                {vStats.top.map(({ x, n }) => (
                  <Link key={x.id} href={withReturn(`/hrms/vendors/${x.id}`, here)} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_64px] items-center gap-2.5 rounded-lg px-1 py-[3px] text-xs hover:bg-[var(--st-card-2)]">
                    <span className="truncate">{x.name}</span>
                    <span className="h-2 overflow-hidden rounded-[4px] bg-[var(--st-card-3)]"><span className="block h-full rounded-[4px] bg-[#F2F2F0]" style={{ width: `${(n / Math.max(1, vStats.top[0].n)) * 100}%` }} /></span>
                    <span className="text-right tabular-nums">{tzs(n, true)}</span>
                  </Link>
                ))}
              </div>
            </StudioCard>
          </StudioCardRow>

          <div className="flex flex-col gap-2 pb-24">
            <div className="hidden grid-cols-[minmax(0,1.5fr)_190px_110px_150px_110px_32px] gap-x-[18px] px-5 text-xs text-[var(--st-muted)] md:grid">
              <span>Supplier</span><span>Contact</span><span>Assets</span><span>Papers</span><span>Spend</span><span />
            </div>
            {vendors.length === 0 && <Empty>{q ? "No supplier matches that." : "No suppliers yet — add the people you buy from and who fix things."}</Empty>}
            {vendors.map((x) => (
              <div key={x.id} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-3 rounded-[14px] bg-[var(--st-surface)] px-5 py-3 transition-shadow hover:shadow-[0_4px_14px_rgba(17,18,20,0.06)] md:grid-cols-[minmax(0,1.5fr)_190px_110px_150px_110px_32px] md:gap-x-[18px]">
                <Link href={withReturn(`/hrms/vendors/${x.id}`, here)} className="min-w-0 md:contents">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{x.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--st-muted)]">{[x.category, x.companyName ?? "Every company", x.location].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="hidden min-w-0 md:block">
                    <span className={cn("block truncate text-[13px]", !x.contactName && "text-[var(--st-muted)]")}>{x.contactName ?? "No contact"}</span>
                    <span className="block truncate text-xs text-[var(--st-muted)]">{x.phone ?? x.email ?? ""}</span>
                  </span>
                  <span className="hidden text-[13px] tabular-nums md:block">{d.vendorAssets[x.id] ?? 0}</span>
                  <span className="hidden md:block">
                    {x.expiredCount ? <Pill dot="var(--st-late)">{x.expiredCount} expired</Pill>
                      : x.expiringCount ? <Pill dot="#F5A524">{x.expiringCount} due soon</Pill>
                      : x.docCount ? <Pill dot="#19C37D">{x.docCount} in date</Pill>
                      : <span className="text-[13px] text-[var(--st-muted)]">None on file</span>}
                  </span>
                  <span className="hidden text-[13px] tabular-nums md:block">{d.vendorSpend[x.id] ? `TZS ${tzs(d.vendorSpend[x.id], true)}` : <span className="text-[var(--st-muted)]">—</span>}</span>
                </Link>
                <RowMenu>
                  <MenuItem onSelect={() => router.push(withReturn(`/hrms/vendors/${x.id}`, here))} icon={<FileText size={14} />}>Open</MenuItem>
                  <MenuItem onSelect={() => setSheet({ k: "vendor", v: x })} icon={<Pencil size={14} />}>Edit details</MenuItem>
                  {x.phone && <MenuItem onSelect={() => { void navigator.clipboard.writeText(x.phone!).then(() => toast(`Copied ${x.phone}`, { tone: "success" })).catch(() => toast(x.phone!)); }} icon={<Copy size={14} />}>Copy phone</MenuItem>}
                  {x.phone && <MenuItem onSelect={() => { window.location.href = `tel:${x.phone}`; }} icon={<Phone size={14} />}>Call</MenuItem>}
                  <MenuLine />
                  <MenuItem onSelect={() => act(() => archiveVendorAction(x.id), `${x.name} archived.`)} icon={<Archive size={14} />}>Archive</MenuItem>
                </RowMenu>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={cn(stFloatBar.page, "-mt-20")}>
        <div className="pointer-events-auto flex w-full max-w-[640px] items-center gap-2.5 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] p-2 pl-4 shadow-[0_10px_28px_rgba(17,18,20,0.12)] sm:h-14 sm:py-0">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[var(--st-muted)]">
            <Search size={15} />
            <span className="sr-only">Search</span>
            <input type="search" value={v.q} onChange={(e) => f.set({ q: e.target.value })}
              placeholder={view === "assets" ? "Search by name, tag, serial or who has it" : view === "tools" ? "Search tools, sizes or sites" : "Search suppliers or contacts"}
              className="bare-field h-9 w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none" />
          </label>
          <span className="shrink-0 pr-2 text-xs text-[var(--st-muted)] tabular-nums">{busy ? <Loader2 size={13} className="animate-spin" /> : `${view === "assets" ? assets.length : view === "tools" ? tools.length : vendors.length} shown`}</span>
          {f.dirty && <Link href={`/hrms/assets${view === "assets" ? "" : `?view=${view}`}`} scroll={false} className="shrink-0 rounded-[10px] bg-[var(--st-page)] px-3 py-2 text-xs hover:bg-[var(--st-seg)]">Clear</Link>}
        </div>
      </div>

      <AssetFormSheet open={sheet?.k === "asset"} onClose={close} asset={sheet?.k === "asset" ? sheet.a : null} lists={d.lists} onCreated={(id) => router.push(`/hrms/assets/${id}`)} />
      <HandOverSheet open={sheet?.k === "hand"} onClose={close} asset={sheet?.k === "hand" ? sheet.a : null} pool={inStore} lists={d.lists} />
      <ReturnSheet open={sheet?.k === "return"} onClose={close} asset={sheet?.k === "return" ? sheet.a : null} pool={handedOut} />
      <ServiceSheet open={sheet?.k === "service"} onClose={close} asset={sheet?.k === "service" ? sheet.a : null} pool={workable} vendors={d.lists.vendors} />
      <ToolFormSheet open={sheet?.k === "tool"} onClose={close} tool={sheet?.k === "tool" ? sheet.t : null} lists={d.lists} />
      <ToolMoveSheet open={sheet?.k === "move"} onClose={close} tool={sheet?.k === "move" ? sheet.t : null} start={sheet?.k === "move" ? sheet.start : "count"} locations={[...new Set([...d.lists.locations, ...tStats.sites.map(([s]) => s).filter((s) => s !== "No site")])]} />
      <VendorFormSheet open={sheet?.k === "vendor"} onClose={close} vendor={sheet?.k === "vendor" ? sheet.v : null} companies={d.lists.companies} />
      <ImportSheet open={sheet?.k === "import"} onClose={close} what={sheet?.k === "import" ? sheet.what : "assets"} companies={d.lists.companies} />
    </StudioScope>
  );
}

/* ------------------------------------------------------------------ bits -- */

function AssetMenu({ a, d, setSheet, act }: {
  a: AssetRow; d: StudioAssetsData; setSheet: (s: Sheet) => void;
  act: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void;
}) {
  const router = useRouter();
  if (d.archived) {
    return (
      <RowMenu>
        <MenuItem onSelect={() => act(() => archiveAssetAction(a.id, false), "Restored.")} icon={<ArchiveRestore size={14} />}>Restore</MenuItem>
      </RowMenu>
    );
  }
  return (
    <RowMenu>
      <MenuItem onSelect={() => router.push(`/hrms/assets/${a.id}`)} icon={<Package size={14} />}>Open</MenuItem>
      <MenuItem onSelect={() => setSheet({ k: "asset", a })} icon={<Pencil size={14} />}>Edit details</MenuItem>
      {a.status === "in_store" && <MenuItem onSelect={() => setSheet({ k: "hand", a })} icon={<UserPlus size={14} />}>Hand over…</MenuItem>}
      {a.status === "assigned" && <MenuItem onSelect={() => setSheet({ k: "return", a })} icon={<Undo2 size={14} />}>Take back…</MenuItem>}
      {a.status !== "retired" && <MenuItem onSelect={() => setSheet({ k: "service", a })} icon={<Wrench size={14} />}>Log a service…</MenuItem>}
      {(a.assignedToName || a.assignedToCompanyName) && <MenuItem onSelect={() => window.open(`/hrms/assets/${a.id}/receipt`, "_blank")} icon={<Printer size={14} />}>Handover receipt</MenuItem>}
      <MenuItem onSelect={() => act(() => checkAssetAction(a.id), `${a.name} seen.`)} icon={<Eye size={14} />}>Seen it (stock-take)</MenuItem>
      <MenuLine />
      {a.status === "maintenance"
        ? <MenuItem onSelect={() => act(() => setAssetStatusAction(a.id, "in_store"), "Back in the store.")} icon={<CircleCheck size={14} />}>Back from the workshop</MenuItem>
        : a.status !== "retired" && <MenuItem onSelect={() => act(() => setAssetStatusAction(a.id, "maintenance"), "Sent to the workshop.")} icon={<Wrench size={14} />}>Send to the workshop</MenuItem>}
      {a.status === "retired"
        ? <MenuItem onSelect={() => act(() => setAssetStatusAction(a.id, "in_store"), "Back in service.")} icon={<ArchiveRestore size={14} />}>Bring back into service</MenuItem>
        : <MenuItem onSelect={() => act(() => setAssetStatusAction(a.id, "retired"), "Retired.")} icon={<Ban size={14} />}>Retire it</MenuItem>}
      <MenuItem onSelect={() => act(() => archiveAssetAction(a.id, true), "Archived.")} icon={<Archive size={14} />}>Archive</MenuItem>
    </RowMenu>
  );
}

function DeskTile({ icon, title, sub, onClick, href, disabled, on }: { icon: ReactNode; title: string; sub: string; onClick?: () => void; href?: string; disabled?: boolean; on?: boolean }) {
  const cls = cn("flex min-w-0 flex-col items-start rounded-xl border border-[var(--st-card-line)] bg-[var(--st-card-2)] p-3 text-left transition-colors hover:bg-[var(--st-card-3)] disabled:opacity-40", on && "border-[#F2F2F0]");
  const inner = <><span className="flex text-[#C9CBCF]">{icon}</span><span className="mt-2.5 block text-[14px]">{title}</span><span className="mt-0.5 block truncate text-[11px] text-[var(--st-on-card-muted)]">{sub}</span></>;
  return href ? <Link href={href} scroll={false} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}

function Stat({ label, value, sub, href, on, tone, className }: { label: string; value: ReactNode; sub?: string; href?: string; on?: boolean; tone?: "warn" | "late"; className?: string }) {
  const cls = cn("flex min-w-0 flex-col rounded-[16px] bg-[var(--st-surface)] px-4 py-3 transition-colors", href && "hover:bg-[var(--st-page)]", on && "ring-1 ring-[var(--st-ink)]", className);
  const inner = (
    <>
      <span className="truncate text-xs text-[var(--st-muted)]">{label}</span>
      <span className={cn("mt-1 truncate text-[24px] leading-none tracking-[-0.03em] tabular-nums", tone === "warn" && "text-[#C07A00]", tone === "late" && "text-[var(--st-late-text)]")}>{value}</span>
      {sub && <span className="mt-1 truncate text-[11px] text-[var(--st-muted)]">{sub}</span>}
    </>
  );
  return href ? <Link href={href} scroll={false} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function RowBtn({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-[30px] w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[var(--st-line)] px-2 text-xs transition-colors hover:bg-[var(--st-page)] disabled:opacity-40">{children}</button>;
}
function Step({ children, onClick, disabled, label }: { children: ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid h-[30px] w-[34px] place-items-center rounded-lg border border-[var(--st-line)] transition-colors hover:bg-[var(--st-page)] disabled:opacity-40">{children}</button>;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="st-tex-paper-dots flex min-h-[160px] items-center justify-center rounded-[20px] border border-dashed border-[var(--st-line)]">
      <span className="rounded-xl bg-[var(--st-page)] px-4 py-2.5 text-[13px] text-[var(--st-sub)]">{children}</span>
    </div>
  );
}
