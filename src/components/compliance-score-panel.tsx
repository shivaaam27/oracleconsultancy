"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2, ExternalLink, FileWarning, PackageCheck, Plus, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ComplianceScore } from "@/lib/compliance";

function tone(score: ComplianceScore) {
  if (score.status === "Risk") return {
    icon: AlertTriangle,
    text: "text-danger",
    bg: "bg-danger-soft/60",
    ring: "ring-danger/25",
  };
  if (score.status === "Watch") return {
    icon: FileWarning,
    text: "text-warn",
    bg: "bg-warn-soft/60",
    ring: "ring-warn/25",
  };
  return {
    icon: CheckCircle2,
    text: "text-success",
    bg: "bg-success-soft/60",
    ring: "ring-success/25",
  };
}

function ownerHref(score: ComplianceScore) {
  return score.ownerType === "company" ? `/documents?company=${score.ownerId}` : `/people?person=${score.ownerId}`;
}

function categoryForRequirement(label: string) {
  const l = label.toLowerCase();
  if (l.includes("passport")) return "Passport";
  if (l.includes("permit") || l.includes("visa") || l.includes("immigration")) return "Immigration";
  if (l.includes("contract") || l.includes("engagement")) return "Contract";
  if (l.includes("tax") || l.includes("tin")) return "Tax";
  if (l.includes("licence") || l.includes("license")) return "Licence";
  if (l.includes("registration")) return "Registration";
  return undefined;
}

function addDocumentHref(score: ComplianceScore, label: string) {
  const params = new URLSearchParams({ newdoc: "1", title: label });
  if (score.ownerType === "company") params.set("company", String(score.ownerId));
  else params.set("person", String(score.ownerId));
  const category = categoryForRequirement(label);
  if (category) params.set("category", category);
  return `/documents?${params.toString()}`;
}

function personPackHref(score: ComplianceScore) {
  const params = new URLSearchParams({
    purpose: "document-request",
    sections: "missingDocuments,documentIssues,linkedDocuments,deadlines,contactDetails,fileLinks",
  });
  return `/people/${score.ownerId}/pack?${params.toString()}`;
}

function ScoreRow({ score, onOpen }: { score: ComplianceScore; onOpen: (score: ComplianceScore) => void }) {
  const t = tone(score);
  const Icon = t.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(score)}
      className="group block w-full rounded-xl px-2 py-2 text-left hover:bg-bg-muted/45 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1", t.bg, t.ring)}>
          <Icon size={17} className={t.text} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium group-hover:text-accent transition-colors">{score.ownerName}</span>
            <span className={cn("ml-auto text-sm font-semibold tabular", t.text)}>{score.score}%</span>
          </span>
          <span className="mt-1 block text-xs text-fg-muted">
            {score.missing} missing - {score.expired} expired - {score.expiring} expiring
          </span>
          {score.gaps[0] && (
            <span className="mt-1 block truncate text-[11px] text-fg-subtle">
              Missing: {score.gaps.slice(0, 2).map((gap) => gap.label).join(", ")}
            </span>
          )}
          {!score.gaps[0] && score.documentIssues[0] && (
            <span className="mt-1 block truncate text-[11px] text-fg-subtle">
              Issue: {score.documentIssues.slice(0, 2).map((doc) => doc.title).join(", ")}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}

function ScoreDetail({ score }: { score: ComplianceScore }) {
  const t = tone(score);
  const gaps = score.gaps;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Score", value: `${score.score}%`, className: t.text },
          { label: "Missing", value: score.missing, className: score.missing ? "text-danger" : "text-success" },
          { label: "Expired", value: score.expired, className: score.expired ? "text-danger" : "text-success" },
          { label: "Expiring", value: score.expiring, className: score.expiring ? "text-warn" : "text-success" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-bg-subtle px-3 py-2 ring-1 ring-border/60">
            <div className={cn("text-lg font-semibold tabular", item.className)}>{item.value}</div>
            <div className="text-[11px] text-fg-muted">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-bg-subtle/60 p-3 ring-1 ring-border/60">
        <div className="text-xs font-medium uppercase tracking-wider text-fg-subtle">Why this score</div>
        <p className="mt-1 text-sm text-fg-muted">
          {score.required > 0
            ? `${score.present} of ${score.required} required item${score.required === 1 ? "" : "s"} are present.`
            : `${score.monitoredDocuments} linked document${score.monitoredDocuments === 1 ? "" : "s"} monitored for expiry.`}
          {" "}
          {score.status === "Risk" ? "This needs attention." : score.status === "Watch" ? "This is worth watching." : "No action is needed right now."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Missing documents</div>
          {gaps.length > 0 ? (
            <div className="rounded-xl overflow-hidden divide-y divide-border/60 ring-1 ring-border/60">
              {gaps.map((gap) => (
                <div key={gap.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="text-danger">Missing</span>
                    <span className="text-fg-muted"> - {gap.label}</span>
                  </span>
                  <Link
                    href={addDocumentHref(score, gap.label)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20"
                  >
                    <Plus size={12} /> Add
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-bg-subtle/60 px-3 py-4 text-sm text-fg-muted ring-1 ring-border/60">
              No required documents are missing.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Expiry issues</div>
          {score.documentIssues.length > 0 ? (
            <div className="rounded-xl overflow-hidden divide-y divide-border/60 ring-1 ring-border/60">
              {score.documentIssues.map((doc) => (
                <div key={doc.id} className="px-3 py-2 text-sm">
                  <div className={cn("font-medium", doc.status === "Expired" ? "text-danger" : "text-warn")}>{doc.status}</div>
                  <div className="text-fg-muted">{doc.title}</div>
                  <div className="text-[11px] text-fg-subtle">{[doc.category, doc.expiryLabel].filter(Boolean).join(" - ")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-bg-subtle/60 px-3 py-4 text-sm text-fg-muted ring-1 ring-border/60">
              No linked documents are expired or expiring.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Link
          href={ownerHref(score)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
        >
          <ExternalLink size={13} /> {score.ownerType === "company" ? "Filter documents" : "Open person"}
        </Link>
        {score.ownerType === "person" && (
          <Link
            href={personPackHref(score)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bg-elev px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-border hover:bg-bg-muted"
          >
            <PackageCheck size={13} /> Person pack PDF
          </Link>
        )}
      </div>
    </div>
  );
}

export function ComplianceScorePanel({
  companyScores,
  personScores,
}: {
  companyScores: ComplianceScore[];
  personScores: ComplianceScore[];
}) {
  const [selected, setSelected] = useState<ComplianceScore | null>(null);
  const riskyCompanies = companyScores.filter((score) => score.status !== "Good");
  const riskyPeople = personScores.filter((score) => score.status !== "Good");
  const portfolioScore = companyScores.length
    ? Math.round(companyScores.reduce((sum, score) => sum + score.score, 0) / companyScores.length)
    : 100;
  const missing = [...companyScores, ...personScores].reduce((sum, score) => sum + score.missing, 0);

  return (
    <>
      <section className="glass elevated rounded-2xl overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={16} className="text-accent" /> Compliance score
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">
              Company checklist plus expat document requirements; other people are monitored when documents exist.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl bg-bg-subtle px-3 py-2 text-xs ring-1 ring-border/60">
              <span className="block text-lg font-semibold tabular">{portfolioScore}%</span>
              Portfolio
            </span>
            <span className="rounded-xl bg-bg-subtle px-3 py-2 text-xs ring-1 ring-border/60">
              <span className="block text-lg font-semibold tabular">{missing}</span>
              Missing
            </span>
          </div>
        </div>

        <div className="grid gap-3 p-3 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Company gaps</div>
            {riskyCompanies.length > 0 ? (
              <div className="divide-y divide-border/50 rounded-xl overflow-hidden">
                {riskyCompanies.slice(0, 4).map((score) => <ScoreRow key={`c-${score.ownerId}`} score={score} onOpen={setSelected} />)}
              </div>
            ) : (
              <div className="rounded-2xl bg-bg-subtle/60 px-4 py-6 text-center text-sm text-fg-muted">
                No company checklist gaps.
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">People gaps</div>
            {riskyPeople.length > 0 ? (
              <div className="divide-y divide-border/50 rounded-xl overflow-hidden">
                {riskyPeople.slice(0, 4).map((score) => <ScoreRow key={`p-${score.ownerId}`} score={score} onOpen={setSelected} />)}
              </div>
            ) : (
              <div className="rounded-2xl bg-bg-subtle/60 px-4 py-6 text-center text-sm text-fg-muted">
                No people checklist gaps.
              </div>
            )}
          </div>
        </div>
      </section>

      <Dialog.Root open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[51] w-[min(680px,calc(100vw-2rem))] max-h-[86vh]
              -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl
              bg-bg-elev border border-border shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-sm font-semibold">
                  {selected?.ownerName ?? "Compliance detail"}
                </Dialog.Title>
                <div className="mt-0.5 text-xs text-fg-muted">
                  {selected?.ownerType === "company" ? "Company compliance" : "Person compliance"} - {selected?.status}
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg"
                >
                  <X size={15} />
                </button>
              </Dialog.Close>
            </div>
            <div className="p-5">
              {selected && <ScoreDetail score={selected} />}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
