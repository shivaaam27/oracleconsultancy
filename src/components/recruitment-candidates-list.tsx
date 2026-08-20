"use client";

// The talent pool — the professionals Oracle can put forward.
//
// ⚠️ There is no money-owed column on this screen, and there never will be. The
// candidate pays Oracle nothing, in any circumstance; the schema has no field
// for it and neither does this list.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Archive, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList, type RecordFilter } from "./record-list";
import { SavedViewsBar, type SavedView } from "./saved-views-bar";
import { useUrlFilters } from "@/lib/use-url-filters";
import { useCreateParam } from "@/lib/use-create-param";
import { useListSort, by, type Sorter } from "@/lib/use-list-sort";
import { buildColumns } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { CANDIDATE_FORM } from "@/lib/recruitment-fields";
import { RecruitmentForm, dateValue, type FormValues } from "./recruitment-form";
import {
  passportState, PASSPORT_TONE, seniorityLabel, candidatePapersMissing,
} from "@/lib/recruitment-shared";
import { usd } from "@/lib/recruitment-money";
import { createCandidateAction, archiveCandidateAction } from "@/app/recruitment/actions";
import type { CandidateFields } from "@/lib/recruitment";

const COLUMNS = ENTITY_VIEWS.rec_candidate!.listColumns;

export type CandidateRow = {
  id: number;
  name: string;
  title: string | null;
  sector: string | null;
  seniority: string | null;
  expectedSalaryUsd: string | null;
  passportExpiry: string | null;
  consentSignedOn: string | null;
  engagementSignedOn: string | null;
  archived: boolean;
};

/* Keys MUST match the column keys in ENTITY_VIEWS.rec_candidate. */
const SORTERS: Record<string, Sorter<CandidateRow>> = {
  name: { cmp: (a, b) => by.text(a.name).localeCompare(by.text(b.name)) },
  seniorityLabel: {
    cmp: (a, b) => SENIORITY_ORDER.indexOf(a.seniority ?? "") - SENIORITY_ORDER.indexOf(b.seniority ?? ""),
    isEmpty: (r) => !r.seniority,
  },
  expectedSalaryUsd: {
    cmp: (a, b) => by.num(a.expectedSalaryUsd) - by.num(b.expectedSalaryUsd),
    isEmpty: (r) => !r.expectedSalaryUsd,
  },
  // Soonest expiry first — the one that stops a placement.
  passport: {
    cmp: (a, b) => by.date(a.passportExpiry) - by.date(b.passportExpiry),
    isEmpty: (r) => !r.passportExpiry,
  },
};
const SENIORITY_ORDER = ["junior", "mid", "senior", "exec"];

const TONE_CHIP: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  success: "text-success",
  muted: "text-fg-subtle",
};

export function RecruitmentCandidatesList({
  items, companyId, savedViews = [],
}: {
  items: CandidateRow[];
  companyId: number;
  savedViews?: SavedView[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  useCreateParam("1", () => setAdding(true));

  const { values: f, set, dirty, query } = useUrlFilters(
    { seniority: "all", flag: "all", archived: "no", q: "" },
    { debounceKeys: ["q"] },
  );
  const { sortHrefs, sortedBy, apply } = useListSort(SORTERS);

  const shown = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return items.filter((c) => {
      if ((f.archived === "yes") !== c.archived) return false;
      if (f.seniority !== "all" && c.seniority !== f.seniority) return false;
      if (f.flag === "passport") {
        const st = passportState(c.passportExpiry);
        if (st !== "expired" && st !== "tooSoon") return false;
      }
      if (f.flag === "papers" && candidatePapersMissing(c).length === 0) return false;
      if (needle) {
        const hay = [c.name, c.title, c.sector].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, f]);

  const rail: RecordFilter[] = useMemo(() => {
    const href = (patch: Record<string, string>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...f, ...patch })) if (v && v !== "all" && v !== "") sp.set(k, v);
      const qs = sp.toString();
      return qs ? `/recruitment/candidates?${qs}` : "/recruitment/candidates";
    };
    const passportTrouble = items.filter((c) => {
      const st = passportState(c.passportExpiry);
      return st === "expired" || st === "tooSoon";
    }).length;
    const papers = items.filter((c) => candidatePapersMissing(c).length > 0).length;
    return [
      { key: "all", label: "Everyone", group: "Pool", count: items.length, href: href({ seniority: "all", flag: "all" }), active: f.seniority === "all" && f.flag === "all" },
      ...(["junior", "mid", "senior", "exec"] as const).map((s) => ({
        key: s, label: seniorityLabel(s), group: "Seniority",
        count: items.filter((c) => c.seniority === s).length,
        href: href({ seniority: s }), active: f.seniority === s,
      })),
      { key: "passport", label: "Passport too near expiry", group: "Attention", count: passportTrouble, href: href({ flag: "passport" }), active: f.flag === "passport", tone: "warn" as const },
      { key: "papers", label: "Papers outstanding", group: "Attention", count: papers, href: href({ flag: "papers" }), active: f.flag === "papers", tone: "warn" as const },
      { key: "archived", label: "Archived", group: "Attention",
        count: items.filter((c) => c.archived).length,
        href: href({ archived: "yes", seniority: "all", flag: "all" }), active: f.archived === "yes" },
    ];
  }, [items, f]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search candidates, roles, sectors…"
          className="h-8 min-w-[200px] flex-1 rounded-md border border-border bg-bg-elev px-2.5 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
        >
          <Plus size={14} /> New candidate
        </button>
      </div>

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={query}
        hasFilters={dirty}
        basePath="/recruitment/candidates"
        listKey="rec_candidate"
      />

      {adding && (
        <RecruitmentForm
          groups={CANDIDATE_FORM}
          initial={{}}
          submitLabel="Save candidate"
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            const res = await createCandidateAction(toCandidateFields(v, companyId));
            if (res.ok) { setAdding(false); router.refresh(); }
            return res;
          }}
          footNote="The candidate is never charged anything, so there is nowhere to record one."
        />
      )}

      <RecordList
        rows={apply(shown)}
        rowKey={(c) => c.id}
        rowHref={(c) => `/recruitment/candidates/${c.id}`}
        listKey="rec_candidate"
        filters={rail}
        total={items.length}
        shown={shown.length}
        bulkActions={[{
          label: "Archive", tone: "danger", icon: <Archive size={12} />,
          run: async (picked) => { for (const c of picked) await archiveCandidateAction(c.id); router.refresh(); },
        }]}
        empty={
          <div className="py-6 text-center">
            <Users size={20} className="mx-auto mb-2 text-fg-subtle" />
            <p className="text-[13px] font-medium">Nobody in the pool yet</p>
            <p className="mt-1 text-[12px] text-fg-subtle">
              Add a candidate once their registration and consent are signed.
            </p>
          </div>
        }
        columns={buildColumns<CandidateRow & Record<string, unknown>>(COLUMNS, {
          sortHrefs,
          sortedBy,
          overrides: {
            name: (c) => (
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{c.name}</span>
                <span className="block truncate text-[11px] text-fg-muted">
                  {[c.title, c.sector].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            ),
            seniorityLabel: (c) => (
              <span className="text-[12px]">{c.seniority ? seniorityLabel(c.seniority) : "—"}</span>
            ),
            expectedSalaryUsd: (c) => (
              <span className="tabular text-[12px]">
                {c.expectedSalaryUsd ? usd(Number(c.expectedSalaryUsd)).replace("USD ", "") : "—"}
              </span>
            ),
            /* A passport that runs out inside six months of the start date stops
               a placement dead, so it is on the row rather than inside it. */
            passport: (c) => {
              const st = passportState(c.passportExpiry);
              const tone = PASSPORT_TONE[st];
              const text = st === "none" ? "—" : st === "expired" ? "Expired" : st === "tooSoon" ? "Under 6 mths" : "OK";
              return (
                <span
                  className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium", TONE_CHIP[tone])}
                  title={c.passportExpiry ? `Expires ${String(c.passportExpiry).slice(0, 10)}` : "No passport recorded"}
                >
                  {(st === "expired" || st === "tooSoon") && <AlertTriangle size={10} />}
                  {text}
                </span>
              );
            },
          },
        })}
      />
    </div>
  );
}

export function toCandidatePatch(v: FormValues): Omit<CandidateFields, "companyId"> {
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  return {
    name: s("name") ?? "",
    title: s("title"),
    sector: s("sector"),
    origin: s("origin"),
    yearsExp: s("yearsExp"),
    seniority: s("seniority"),
    expectedSalaryUsd: s("expectedSalaryUsd"),
    email: s("email"),
    phone: s("phone"),
    passportNo: s("passportNo"),
    passportExpiry: s("passportExpiry"),
    ecnr: !!v.ecnr,
    idVerified: !!v.idVerified,
    partnerName: s("partnerName"),
    consentSignedOn: s("consentSignedOn"),
    engagementSignedOn: s("engagementSignedOn"),
    notes: s("notes"),
  };
}

/** The same values plus the company — what a CREATE needs. */
export function toCandidateFields(v: FormValues, companyId: number): CandidateFields {
  return { companyId, ...toCandidatePatch(v) };
}

export function candidateFormValues(c: {
  name: string; title: string | null; sector: string | null; origin: string;
  yearsExp: number | null; seniority: string | null; expectedSalaryUsd: string | null;
  email: string | null; phone: string | null; passportNo: string | null;
  passportExpiry: string | null; ecnr: boolean; idVerified: boolean;
  partnerName: string | null; consentSignedOn: string | null;
  engagementSignedOn: string | null; notes: string | null;
}): FormValues {
  return {
    name: c.name,
    title: c.title ?? "",
    sector: c.sector ?? "",
    origin: c.origin ?? "",
    yearsExp: c.yearsExp == null ? "" : String(c.yearsExp),
    seniority: c.seniority ?? "",
    expectedSalaryUsd: c.expectedSalaryUsd ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    passportNo: c.passportNo ?? "",
    passportExpiry: dateValue(c.passportExpiry),
    ecnr: c.ecnr,
    idVerified: c.idVerified,
    partnerName: c.partnerName ?? "",
    consentSignedOn: dateValue(c.consentSignedOn),
    engagementSignedOn: dateValue(c.engagementSignedOn),
    notes: c.notes ?? "",
  };
}
