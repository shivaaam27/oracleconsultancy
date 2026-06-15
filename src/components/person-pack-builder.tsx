"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ClipboardList, FileText, FileWarning, Loader2, Mail, MessageCircle, PackageCheck, Phone, Plus, Send, ShieldCheck, Sliders } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createPersonPackDraftAction, savePersonPackPrefsAction } from "@/app/people/pack-actions";
import { reqAdd } from "@/app/people/requirement-actions";
import { cn } from "@/lib/cn";
import { channelLabel, contactForChannel, pickChannel, type Channel } from "@/lib/outbox-links";
import type {
  PersonPackPurpose,
  PersonPackSectionKey,
  PersonPackSectionSelection,
} from "@/lib/person-pack-shared";
import { serialisePersonPackSections, parsePersonPackSections } from "@/lib/person-pack-shared";
import { personTypeLabel, type PersonType } from "@/lib/person-types";
import { BRAND_NAME } from "@/lib/brand";

type PackResponse = {
  purpose: PersonPackPurpose;
  detail: {
    person: {
      id: number;
      name: string;
      role: string | null;
      companyName: string | null;
      personType: PersonType;
      email: string | null;
      phone: string | null;
      whatsapp: string | null;
      preferredChannel: string | null;
    };
  };
  compliance: {
    score: number;
    status: "Good" | "Watch" | "Risk";
    required: number;
    present: number;
    monitoredDocuments: number;
    gaps: Array<{ id: string; label: string }>;
    documentIssues: Array<{ id: number; title: string; status: "Expired" | "Expiring"; expiryLabel: string | null }>;
  };
  documents: Array<{
    id: number;
    title: string;
    category: string | null;
    docType: string | null;
    expiryDate: string | null;
    expiryLabel: string | null;
    status: "Valid" | "Expiring" | "Expired" | "No expiry" | "Archived";
    fileUrl: string | null;
    fileName: string | null;
    companyName: string | null;
  }>;
  openTasks: Array<{ id: number; code: string; actionItem: string; deadline: string | null; priority: string; latestUpdate: string | null }>;
  personalTodos: Array<{ id: number; title: string; dueAt: string | null; important: boolean; taskCode: string | null }>;
  drafts: Array<{ id: number; status: string; source: string | null; createdAt: string }>;
  recommendedSelection: PersonPackSectionSelection;
  savedPrefs: { sections: string | null; excluded: string[] } | null;
  counts: {
    missingDocuments: number;
    documentIssues: number;
    linkedDocuments: number;
    openTasks: number;
    personalTodos: number;
    drafts: number;
  };
};

const purposeNames: Record<PersonPackPurpose, string> = {
  "document-request": "Documents",
  "expat-onboarding": "Expat Onboarding",
  "visa-permit": "Visa / Permit",
  "work-permit-renewal": "Work Permit Renewal",
  recruitment: "Recruitment",
  "contract-signing": "Contract Signing",
  "task-reminder": "Work Reminder",
  custom: "Custom",
};

// Real, useful reasons. (The old "Custom" reason was redundant with the
// "Customise sections" panel below; "Work reminder" is now the one-tap Remind
// action in the drawer footer — both removed to avoid duplication.)
const purposeOptions: Array<{ id: PersonPackPurpose; label: string; hint: string }> = [
  { id: "document-request", label: "Documents", hint: "Chase the documents still missing." },
  { id: "visa-permit", label: "Visa / Permit", hint: "Immigration documents and key dates." },
  { id: "expat-onboarding", label: "Onboarding", hint: "Everything needed to get set up." },
  { id: "recruitment", label: "Recruitment", hint: "Candidate file items." },
  { id: "contract-signing", label: "Contract", hint: "Contract documents to sign." },
];

const channelIcons: Record<Channel, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  SMS: Phone,
};

const sectionLabels: Array<{ key: PersonPackSectionKey; label: string; hint?: string; sensitive?: boolean }> = [
  { key: "missingDocuments", label: "Documents needed", hint: "Missing items to request from the person." },
  { key: "documentIssues", label: "Expiry issues", hint: "Expired or expiring documents linked to them." },
  { key: "linkedDocuments", label: "Document list", hint: "A person-facing list of their saved documents." },
  { key: "fileLinks", label: "File links", hint: "Include document links or filenames.", sensitive: true },
  { key: "openTasks", label: "Open work", hint: "Tasks currently assigned to this person." },
  { key: "personalTodos", label: "Personal to-dos", hint: "To-dos assigned to this person." },
  { key: "deadlines", label: "Due dates", hint: "Show dates next to selected documents/work." },
  { key: "latestUpdates", label: "Latest updates", hint: "Include recent task update text.", sensitive: true },
  { key: "contactDetails", label: "Contact details", hint: "Email, WhatsApp and phone on record." },
  { key: "companyContext", label: "Company/role context", hint: "Primary company, role and links." },
  { key: "complianceScore", label: "Compliance score", hint: "Internal scoring, not normally recipient-facing.", sensitive: true },
  { key: "internalNotes", label: "Internal notes", hint: "Private notes from the person record.", sensitive: true },
];

const sectionMeta = Object.fromEntries(sectionLabels.map((section) => [section.key, section])) as Record<
  PersonPackSectionKey,
  (typeof sectionLabels)[number]
>;

const sectionGroups: Array<{
  title: string;
  hint: string;
  icon: typeof FileText;
  keys: PersonPackSectionKey[];
  sensitive?: boolean;
}> = [
  {
    title: "Request",
    hint: "What the person needs to send or fix.",
    icon: FileWarning,
    keys: ["missingDocuments", "documentIssues", "deadlines"],
  },
  {
    title: "Saved documents",
    hint: "Show what Oracle Consultancy already has for this person.",
    icon: FileText,
    keys: ["linkedDocuments", "fileLinks"],
  },
  {
    title: "Work follow-up",
    hint: "Only include this when the message is about work.",
    icon: ClipboardList,
    keys: ["openTasks", "personalTodos", "latestUpdates"],
  },
  {
    title: "Profile",
    hint: "Basic contact and role context.",
    icon: Phone,
    keys: ["contactDetails", "companyContext"],
  },
  {
    title: "Sensitive internal",
    hint: "Normally keep this out of person-facing packs.",
    icon: ShieldCheck,
    keys: ["complianceScore", "internalNotes"],
    sensitive: true,
  },
];

function fmtDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function categoryForRequirement(label: string) {
  const l = label.toLowerCase();
  if (l.includes("passport")) return "Passport";
  if (l.includes("permit") || l.includes("visa") || l.includes("immigration")) return "Immigration";
  if (l.includes("contract") || l.includes("engagement")) return "Contract";
  return undefined;
}

function addDocumentHref(personId: number, label: string) {
  const params = new URLSearchParams({ newdoc: "1", person: String(personId), title: label, from: `person:${personId}` });
  const category = categoryForRequirement(label);
  if (category) params.set("category", category);
  return `/documents?${params.toString()}`;
}

function addPersonDocumentHref(personId: number) {
  return `/documents?${new URLSearchParams({ newdoc: "1", person: String(personId), from: `person:${personId}` }).toString()}`;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Per-reason relevance — makes each pack genuinely tailored instead of showing
 * the same lists. Returns a predicate over a document/requirement's text
 * (category + type + title), or null for reasons that cover everything.
 */
function purposeRelevance(purpose: PersonPackPurpose): ((text: string) => boolean) | null {
  switch (purpose) {
    case "visa-permit":
    case "work-permit-renewal":
      return (s) => /visa|permit|immigration|residence|passport|work\s*permit/i.test(s);
    case "recruitment":
      return (s) => /\bcv\b|r[eé]sum|curriculum|certificate|national\s*id|nida|passport|reference|photo|academic|transcript|qualification/i.test(s);
    case "contract-signing":
      return (s) => /contract|agreement|engagement|offer\s*letter|\bnda\b|terms/i.test(s);
    // Documents + Onboarding cover the full set.
    case "document-request":
    case "expat-onboarding":
    default:
      return null;
  }
}

function documentFileLabel(doc: PackResponse["documents"][number]) {
  if (doc.fileUrl) return "External link";
  if (doc.fileName) return doc.fileName;
  return null;
}

function complianceText(pack: PackResponse) {
  const c = pack.compliance;
  if (c.required === 0 && c.monitoredDocuments === 0) {
    return "No required checklist applies yet, and no person-linked documents are on file.";
  }
  if (c.required === 0) {
    return `${plural(c.monitoredDocuments, "linked document")} monitored for expiry. Score ${c.score}% (${c.status}).`;
  }
  return `${c.present} of ${c.required} required items are present. Score ${c.score}% (${c.status}).`;
}

function selectedActionCount(pack: PackResponse, selection: PersonPackSectionSelection) {
  return (
    (selection.missingDocuments ? pack.compliance.gaps.length : 0) +
    (selection.documentIssues ? pack.compliance.documentIssues.length : 0) +
    (selection.openTasks ? pack.openTasks.length : 0) +
    (selection.personalTodos ? pack.personalTodos.length : 0)
  );
}

function purposeLabel(purpose: PersonPackPurpose) {
  return purposeNames[purpose] ?? "Person Pack";
}

function listLines(items: string[], limit: number) {
  const shown = items.slice(0, limit);
  const more = items.length - shown.length;
  return [...shown.map((item) => `- ${item}`), ...(more > 0 ? [`- ${more} more item${more === 1 ? "" : "s"} in the pack.`] : [])];
}

function buildPersonPackMessage(
  pack: PackResponse,
  selection: PersonPackSectionSelection,
  purpose: PersonPackPurpose,
  channel: Channel
) {
  const person = pack.detail.person;
  const title = purposeLabel(purpose);
  const subject = `${title}: ${person.name}`;
  const limit = channel === "EMAIL" ? 14 : 8;
  const sections: string[] = [];

  if (selection.missingDocuments) {
    if (pack.compliance.gaps.length) {
      sections.push("Documents needed:", ...listLines(pack.compliance.gaps.map((gap) => gap.label), limit));
    } else {
      sections.push(pack.compliance.required === 0 ? "Missing documents: no required checklist applies yet." : "Missing documents: none currently missing.");
    }
  }

  if (selection.documentIssues) {
    if (pack.compliance.documentIssues.length) {
      sections.push(
        "Documents needing attention:",
        ...listLines(pack.compliance.documentIssues.map((doc) => `${doc.title}${doc.expiryLabel ? ` (${doc.expiryLabel})` : ""}`), limit)
      );
    } else {
      sections.push("Expired/expiring documents: none found.");
    }
  }

  if (selection.linkedDocuments) {
    if (pack.documents.length) {
      sections.push(
        "Documents on file:",
        ...listLines(
          pack.documents.map((doc) => {
            const file = selection.fileLinks && doc.fileUrl ? ` - ${doc.fileUrl}` : "";
            const expiry = doc.expiryLabel ?? fmtDate(doc.expiryDate);
            return `${doc.title} (${doc.status}${expiry ? `, ${expiry}` : ""})${file}`;
          }),
          limit
        )
      );
    } else {
      sections.push("Documents on file: none linked to your profile yet.");
    }
  }

  if (selection.openTasks) {
    if (pack.openTasks.length) {
      sections.push(
        "Open work:",
        ...listLines(
          pack.openTasks.map((task) => {
            const due = selection.deadlines && task.deadline ? `, due ${fmtDate(task.deadline)}` : "";
            return `${task.code}: ${task.actionItem}${due} (${task.priority})`;
          }),
          limit
        )
      );
    } else {
      sections.push("Open work: none assigned.");
    }
  }

  if (selection.personalTodos) {
    if (pack.personalTodos.length) {
      sections.push(
        "To-dos:",
        ...listLines(
          pack.personalTodos.map((todo) => `${todo.title}${selection.deadlines && todo.dueAt ? ` (due ${fmtDate(todo.dueAt)})` : ""}`),
          limit
        )
      );
    } else {
      sections.push("To-dos: none assigned.");
    }
  }

  if (sections.length === 0) {
    sections.push("No sections are selected yet.");
  }

  if (channel === "SMS") {
    const actions = selectedActionCount(pack, selection);
    return {
      subject,
      body: actions > 0
        ? `Hi ${person.name}, ${BRAND_NAME} reminder: ${actions} selected item${actions === 1 ? "" : "s"} need attention. Please review the pack and send updates.`
        : `Hi ${person.name}, ${BRAND_NAME}: your selected HR pack has no action items right now. Thanks.`,
    };
  }

  const greeting = `Hi ${person.name},`;
  const intro = channel === "EMAIL"
    ? `Please find below the selected ${title.toLowerCase()} items for your review.`
    : `Here are the selected ${title.toLowerCase()} items for your review.`;
  const body = [greeting, "", intro, "", ...sections, "", "Thanks,", BRAND_NAME].join("\n");
  return { subject, body };
}

function ReasonPicker({
  purpose,
  setPurpose,
}: {
  purpose: PersonPackPurpose;
  setPurpose: (purpose: PersonPackPurpose) => void;
}) {
  const current = purposeOptions.find((o) => o.id === purpose) ?? null;
  return (
    <div className="space-y-1.5">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {purposeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setPurpose(option.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
              purpose === option.id ? "bg-accent text-accent-fg ring-transparent" : "bg-bg-subtle text-fg-muted ring-border/60 hover:text-fg"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {current && <p className="px-1 text-[11px] text-fg-subtle">{current.hint}</p>}
    </div>
  );
}

function SectionToggle({
  sectionKey,
  checked,
  onToggle,
}: {
  sectionKey: PersonPackSectionKey;
  checked: boolean;
  onToggle: (key: PersonPackSectionKey) => void;
}) {
  const meta = sectionMeta[sectionKey];

  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-start gap-2 rounded-xl px-2.5 py-2.5 text-xs ring-1 transition-colors",
        checked ? "bg-accent-soft/55 ring-accent/25" : "bg-bg-subtle/55 ring-border/70 hover:bg-bg-muted"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(sectionKey)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-fg">{meta.label}</span>
          {meta.sensitive && <Badge tone="warn">careful</Badge>}
        </span>
        {meta.hint && <span className="mt-0.5 block leading-relaxed text-fg-subtle">{meta.hint}</span>}
      </span>
    </label>
  );
}

function IncludeGroups({
  selection,
  toggle,
}: {
  selection: PersonPackSectionSelection;
  toggle: (key: PersonPackSectionKey) => void;
}) {
  const normalGroups = sectionGroups.filter((group) => !group.sensitive);
  const sensitiveGroups = sectionGroups.filter((group) => group.sensitive);

  const groupBlock = (group: (typeof sectionGroups)[number]) => {
    const Icon = group.icon;
    const selected = group.keys.filter((key) => selection[key]).length;
    return (
      <div key={group.title} className="glass elevated rounded-2xl p-3">
        <div className="mb-2 flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-bg-subtle text-fg-muted ring-1 ring-border/60">
            <Icon size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{group.title}</div>
              <Badge tone={selected ? "accent" : "default"}>{selected}/{group.keys.length}</Badge>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{group.hint}</p>
          </div>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {group.keys.map((key) => (
            <SectionToggle key={key} sectionKey={key} checked={selection[key]} onToggle={toggle} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
        {normalGroups.map(groupBlock)}
        {sensitiveGroups.map((group) => (
          <details key={group.title} className="group rounded-2xl bg-bg-subtle/45 ring-1 ring-border/70">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-fg-muted">
              <ShieldCheck size={14} className="text-warn" />
              Sensitive internal items
              <span className="ml-auto text-[11px] text-fg-subtle">open only if needed</span>
            </summary>
            <div className="px-3 pb-3">
              <p className="mb-2 text-xs leading-relaxed text-fg-muted">{group.hint}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {group.keys.map((key) => (
                  <SectionToggle key={key} sectionKey={key} checked={selection[key]} onToggle={toggle} />
                ))}
              </div>
            </div>
          </details>
        ))}
    </div>
  );
}

function Preview({
  pack,
  selection,
  gapSelection,
  onToggleGap,
  allGaps,
  newItem,
  setNewItem,
  onAddItem,
  addingItem,
}: {
  pack: PackResponse;
  selection: PersonPackSectionSelection;
  gapSelection: Set<string>;
  onToggleGap: (id: string) => void;
  allGaps: PackResponse["compliance"]["gaps"];
  newItem: string;
  setNewItem: (v: string) => void;
  onAddItem: (label: string) => void;
  addingItem: boolean;
}) {
  const included = useMemo(() => sectionLabels.filter((s) => selection[s.key]), [selection]);

  if (included.length === 0) {
    return (
      <div className="rounded-xl bg-bg-subtle/60 ring-1 ring-border p-4 text-sm text-fg-muted">
        Choose at least one section to prepare a pack.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selection.missingDocuments && (
        <div className="glass elevated rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <FileWarning size={13} /> Documents to request
            {allGaps.length > 0 && <span className="ml-auto text-[11px] text-fg-subtle">{gapSelection.size} of {allGaps.length} ticked</span>}
          </div>
          {allGaps.length ? (
            <div className="mt-2 space-y-1.5">
              {allGaps.map((gap) => {
                const ticked = gapSelection.has(gap.id);
                return (
                  <label key={gap.id} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm cursor-pointer ring-1 transition-colors", ticked ? "bg-accent-soft/40 ring-accent/20" : "bg-bg-subtle/40 ring-border/60")}>
                    <input type="checkbox" checked={ticked} onChange={() => onToggleGap(gap.id)} className="h-4 w-4 shrink-0 accent-[hsl(var(--accent))]" />
                    <span className={cn("min-w-0 flex-1", !ticked && "text-fg-muted line-through")}>{gap.label}</span>
                    <a
                      href={addDocumentHref(pack.detail.person.id, gap.label)}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20"
                    >
                      <Plus size={12} /> Add
                    </a>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">
              {pack.compliance.required === 0
                ? "No required checklist applies to this person type yet."
                : "No missing required documents — all good."}
            </p>
          )}
          {/* Add a request item manually — saved to the person's checklist. */}
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2.5">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddItem(newItem); }}
              placeholder="Add an item to request…"
              className="min-w-0 flex-1 rounded-md bg-bg-subtle/60 px-2.5 py-1.5 text-xs ring-1 ring-border/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              disabled={addingItem || !newItem.trim()}
              onClick={() => onAddItem(newItem)}
            >
              {addingItem ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
            </Button>
          </div>
        </div>
      )}

      {selection.documentIssues && (
        <div className="glass elevated rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <FileWarning size={13} /> Expired / expiring
          </div>
          {pack.compliance.documentIssues.length ? (
            <div className="mt-2 space-y-1.5">
              {pack.compliance.documentIssues.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                  <Badge tone={doc.status === "Expired" ? "danger" : "warn"}>{doc.expiryLabel ?? doc.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">No expired or expiring documents found.</p>
          )}
        </div>
      )}

      {selection.linkedDocuments && (
        <div className="glass elevated rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <FileText size={13} /> Linked documents
          </div>
          {pack.documents.length ? (
            <div className="mt-2 space-y-1.5">
              {pack.documents.slice(0, 8).map((doc) => {
                const fileLabel = selection.fileLinks ? documentFileLabel(doc) : null;
                return (
                  <div key={doc.id} className="flex items-start gap-2 rounded-lg bg-bg-subtle/45 px-2.5 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{doc.title}</div>
                      <div className="text-xs text-fg-muted">
                        {[doc.category, doc.expiryLabel ?? fmtDate(doc.expiryDate), fileLabel].filter(Boolean).join(" - ") || "No expiry recorded"}
                      </div>
                    </div>
                    <Badge tone={doc.status === "Expired" ? "danger" : doc.status === "Expiring" ? "warn" : "default"}>{doc.status}</Badge>
                  </div>
                );
              })}
              {pack.documents.length > 8 && (
                <p className="text-xs text-fg-muted">+ {pack.documents.length - 8} more linked documents.</p>
              )}
            </div>
          ) : (
            <div className="mt-2 rounded-lg bg-bg-subtle/50 px-3 py-3 text-sm text-fg-muted">
              No person-linked documents are on file yet.
              <a href={addPersonDocumentHref(pack.detail.person.id)} className="ml-2 inline-flex items-center gap-1 text-accent hover:underline">
                <Plus size={12} /> Add one
              </a>
            </div>
          )}
        </div>
      )}

      {selection.openTasks && (
        <div className="glass elevated rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <ClipboardList size={13} /> Open tasks
          </div>
          {pack.openTasks.length ? (
            <div className="mt-2 space-y-2">
              {pack.openTasks.slice(0, 8).map((task) => (
                <div key={task.id} className="text-sm">
                  <div className="font-medium">{task.actionItem}</div>
                  <div className="text-xs text-fg-muted">
                    {selection.deadlines && task.deadline ? `${fmtDate(task.deadline)} - ` : ""}
                    {task.priority} - {task.code}
                  </div>
                  {selection.latestUpdates && task.latestUpdate && (
                    <p className="mt-1 text-xs text-fg-muted line-clamp-2">{task.latestUpdate}</p>
                  )}
                </div>
              ))}
              {pack.openTasks.length > 8 && (
                <p className="text-xs text-fg-muted">+ {pack.openTasks.length - 8} more open tasks.</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">No open tasks assigned.</p>
          )}
        </div>
      )}

      {selection.personalTodos && (
        <div className="glass elevated rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <Check size={13} /> Personal to-dos
          </div>
          {pack.personalTodos.length ? (
            <div className="mt-2 space-y-1.5 text-sm">
              {pack.personalTodos.slice(0, 8).map((todo) => (
                <div key={todo.id}>
                  - {todo.title}
                  {selection.deadlines && todo.dueAt ? <span className="text-fg-muted"> ({fmtDate(todo.dueAt)})</span> : null}
                </div>
              ))}
              {pack.personalTodos.length > 8 && (
                <p className="text-xs text-fg-muted">+ {pack.personalTodos.length - 8} more to-dos.</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">No open personal to-dos assigned.</p>
          )}
        </div>
      )}

      {selection.complianceScore && (
        <div className="glass elevated rounded-xl p-3 text-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <ShieldCheck size={13} /> Compliance status
          </div>
          <p className="mt-2 text-sm text-fg-muted">{complianceText(pack)}</p>
        </div>
      )}
    </div>
  );
}

function DraftMessagePreview({
  pack,
  channel,
  setChannel,
  message,
}: {
  pack: PackResponse;
  channel: Channel;
  setChannel: (channel: Channel) => void;
  message: { subject: string; body: string };
}) {
  const contact = contactForChannel(pack.detail.person, channel);

  return (
    <div className="glass elevated rounded-xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Message preview</div>
          <div className="mt-0.5 text-xs text-fg-subtle">{contact || `No ${channelLabel(channel).toLowerCase()} contact saved`}</div>
        </div>
        <div className="flex rounded-lg bg-bg-subtle p-1 ring-1 ring-border/60">
          {(["WHATSAPP", "EMAIL", "SMS"] as Channel[]).map((option) => {
            const Icon = channelIcons[option];
            return (
              <button
                key={option}
                type="button"
                onClick={() => setChannel(option)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  channel === option ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                )}
              >
                <Icon size={13} /> {channelLabel(option)}
              </button>
            );
          })}
        </div>
      </div>
      {channel === "EMAIL" && (
        <div className="mt-3 rounded-lg bg-bg-subtle/60 px-3 py-2 text-xs">
          <span className="text-fg-subtle">Subject: </span>
          <span className="font-medium">{message.subject}</span>
        </div>
      )}
      <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-bg-subtle/60 p-3 text-xs leading-relaxed text-fg-muted">
        {message.body}
      </pre>
    </div>
  );
}

export function PersonPackPanel({
  personId,
  personName,
  initialPurpose,
  onBack,
}: {
  personId: number;
  personName: string;
  initialPurpose?: PersonPackPurpose;
  onBack: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [purpose, setPurpose] = useState<PersonPackPurpose>(initialPurpose ?? "document-request");
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [selection, setSelection] = useState<PersonPackSectionSelection | null>(null);
  const [channel, setChannel] = useState<Channel>("WHATSAPP");
  const [draftPending, startDraftTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which missing items to actually request (default: all). Lets you chase
  // only the few you want. Everything downstream uses the filtered pack.
  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(new Set());
  const [newItem, setNewItem] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  // Guards the first save right after applying loaded prefs; holds the debounce.
  const skipSaveRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const relevant = useMemo(() => purposeRelevance(purpose), [purpose]);

  // The pack narrowed to (a) the ticked request items and (b) only the
  // documents/issues relevant to the chosen reason, so each pack is tailored.
  const effPack = useMemo<PackResponse | null>(() => {
    if (!pack) return null;
    const docText = (d: PackResponse["documents"][number]) => [d.category, d.docType, d.title].filter(Boolean).join(" ");
    const gaps = pack.compliance.gaps.filter((g) => selectedGaps.has(g.id) && (!relevant || relevant(g.label)));
    if (!relevant) return { ...pack, compliance: { ...pack.compliance, gaps } };
    const documentIssues = pack.compliance.documentIssues.filter((d) => relevant(d.title));
    const documents = pack.documents.filter((d) => relevant(docText(d)));
    return { ...pack, compliance: { ...pack.compliance, gaps, documentIssues }, documents };
  }, [pack, selectedGaps, relevant]);

  const messagePreview = useMemo(
    () => (effPack && selection ? buildPersonPackMessage(effPack, selection, purpose, channel) : null),
    [effPack, selection, purpose, channel]
  );

  function toggleGap(id: string) {
    setSelectedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/person-pack?id=${personId}&purpose=${purpose}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not prepare this pack");
        return res.json();
      })
      .then((data: PackResponse) => {
        if (cancelled) return;
        setPack(data);
        setChannel(pickChannel(data.detail.person));
        // Restore the operator's saved choices for this person+purpose; fall
        // back to the recommended sections + all items ticked.
        const prefs = data.savedPrefs;
        const savedSelection = prefs?.sections != null ? parsePersonPackSections(prefs.sections) : null;
        setSelection(savedSelection ?? data.recommendedSelection);
        const excluded = new Set((prefs?.excluded ?? []).map((l) => l.trim().toLowerCase()));
        setSelectedGaps(
          new Set(
            data.compliance.gaps
              .filter((g) => !excluded.has(g.label.trim().toLowerCase()))
              .map((g) => g.id)
          )
        );
        skipSaveRef.current = true; // don't re-save what we just loaded
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [personId, purpose]);

  // Persist the operator's choices (sections + unticked request items) per
  // person+purpose, debounced, so they survive reopening and refreshes. Skips
  // the run triggered by applying freshly-loaded prefs.
  useEffect(() => {
    if (!pack || !selection) return;
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    const excluded = pack.compliance.gaps.filter((g) => !selectedGaps.has(g.id)).map((g) => g.label);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void savePersonPackPrefsAction({
        personId,
        purpose,
        sections: serialisePersonPackSections(selection),
        excluded,
      });
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, selectedGaps, pack]);

  // Re-fetch the pack after a manual change (e.g. a request item was added),
  // keeping the current section choices. Only genuinely-new gaps (absent from
  // the previous pack) are auto-ticked — items you deliberately unticked stay
  // unticked rather than snapping back to checked.
  async function reloadPack() {
    const res = await fetch(`/api/person-pack?id=${personId}&purpose=${purpose}`);
    if (!res.ok) return;
    const data: PackResponse = await res.json();
    const prevGapIds = new Set((pack?.compliance.gaps ?? []).map((g) => g.id));
    setPack(data);
    setSelectedGaps((prev) => {
      const next = new Set(prev);
      for (const g of data.compliance.gaps) if (!prevGapIds.has(g.id)) next.add(g.id);
      return next;
    });
  }

  async function addRequestItem(label: string) {
    const trimmed = label.trim();
    if (!trimmed || addingItem) return;
    setAddingItem(true);
    try {
      const res = await reqAdd(personId, { label: trimmed, category: null, mandatory: true });
      if (!res.ok) {
        toast(res.error, { tone: "danger" });
        return;
      }
      await reloadPack();
      setNewItem("");
      toast("Added to this person's checklist.", { tone: "success" });
    } finally {
      setAddingItem(false);
    }
  }

  function toggle(key: PersonPackSectionKey) {
    setSelection((current) => current ? { ...current, [key]: !current[key] } : current);
  }

  // Print the styled pack page in place via a hidden iframe — no new tab.
  function openPdf() {
    if (!selection) return;
    const params = new URLSearchParams({ purpose, sections: serialisePersonPackSections(selection) });
    // Carry the unticked request items so the PDF matches the preview exactly.
    // Encoded (encodeURIComponent → base64) to survive accents/punctuation.
    const excluded = (pack?.compliance.gaps ?? [])
      .filter((g) => !selectedGaps.has(g.id) || (relevant ? !relevant(g.label) : false))
      .map((g) => g.label);
    if (excluded.length) params.set("exclude", btoa(encodeURIComponent(JSON.stringify(excluded))));
    const url = `/people/${personId}/pack?${params.toString()}`;
    const existing = document.getElementById("pack-print-frame");
    if (existing) existing.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "pack-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    iframe.onload = () => {
      setTimeout(() => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
        catch { window.open(url, "_blank", "noopener,noreferrer"); }
      }, 400);
    };
    document.body.appendChild(iframe);
  }

  function createDraft() {
    if (!pack || !selection || !messagePreview) return;
    const sections = serialisePersonPackSections(selection);
    startDraftTransition(async () => {
      const res = await createPersonPackDraftAction({
        personId,
        purpose,
        sections,
        channel,
        subject: messagePreview.subject,
        body: messagePreview.body,
      });
      if (!res.ok) {
        toast(res.error, { tone: "danger", duration: 4500 });
        return;
      }
      toast(
        res.created
          ? res.contactMissing
            ? "Draft saved in Outbox, but this channel has no contact saved."
            : "Person pack draft saved in Outbox."
          : "A matching person pack draft already exists today.",
        { tone: res.contactMissing ? "warn" : res.created ? "success" : "default", duration: 4500 }
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* Back + title */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-border bg-bg-elev/60 text-fg-muted hover:text-accent hover:ring-accent/40 transition-colors">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold"><PackageCheck size={14} className="text-accent" /> Prepare pack</div>
          <div className="text-[11px] text-fg-muted truncate">For {personName} · pick a reason and what to include.</div>
        </div>
      </div>

      <ReasonPicker purpose={purpose} setPurpose={setPurpose} />

      {selection && (
        <details className="group glass elevated rounded-2xl">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-fg-muted">
            <Sliders size={13} /> Customise sections
            <span className="ml-auto text-[11px] text-fg-subtle">optional · pre-filled</span>
          </summary>
          <div className="px-3 pb-3"><IncludeGroups selection={selection} toggle={toggle} /></div>
        </details>
      )}

      {loading && (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-fg-muted">
          <Loader2 size={16} className="animate-spin" /> Preparing pack…
        </div>
      )}
      {error && <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div>}
      {!loading && effPack && selection && (
        <>
          <Preview pack={effPack} selection={selection} gapSelection={selectedGaps} onToggleGap={toggleGap} allGaps={(pack?.compliance.gaps ?? []).filter((g) => !relevant || relevant(g.label))} newItem={newItem} setNewItem={setNewItem} onAddItem={addRequestItem} addingItem={addingItem} />
          {messagePreview && <DraftMessagePreview pack={effPack} channel={channel} setChannel={setChannel} message={messagePreview} />}
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border/70 bg-bg-elev/70 px-4 py-2.5 backdrop-blur">
            <Button type="button" variant="secondary" size="sm" onClick={openPdf}>Download PDF</Button>
            <Button type="button" size="sm" onClick={createDraft} loading={draftPending}><Send size={13} /> Save draft</Button>
          </div>
        </>
      )}
    </div>
  );
}
