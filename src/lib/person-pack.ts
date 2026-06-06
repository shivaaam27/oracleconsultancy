import { sb } from "@/db/supabase";
import { isOpen } from "@/lib/derive";
import {
  buildPersonComplianceScores,
  type ComplianceScore,
} from "@/lib/compliance";
import { deriveDocStatus, expiryLabel, listDocuments, type DocumentRow } from "@/lib/documents";
import { getPersonDetail, type PersonDetail } from "@/lib/people-queries";
import type { TaskRow } from "@/lib/queries";
import type { Channel } from "@/lib/outbox-links";
import {
  blankPersonPackSelection,
  type PersonPackPurpose,
  type PersonPackSectionSelection,
} from "@/lib/person-pack-shared";

export type {
  PersonPackPurpose,
  PersonPackSectionKey,
  PersonPackSectionSelection,
} from "@/lib/person-pack-shared";
export {
  parsePersonPackSections,
  serialisePersonPackSections,
} from "@/lib/person-pack-shared";

export type PersonPackTodo = {
  id: number;
  title: string;
  done: boolean;
  important: boolean;
  dueAt: Date | null;
  companyId: number | null;
  companyName: string | null;
  taskId: number | null;
  taskCode: string | null;
};

export type PersonPackDraft = {
  id: number;
  channel: Channel;
  subject: string | null;
  source: string | null;
  createdAt: Date;
  sentAt: Date | null;
  status: string;
};

export type PersonPackDocument = DocumentRow & {
  companyName: string | null;
  status: ReturnType<typeof deriveDocStatus>;
  expiryLabel: string | null;
};

export type PersonPack = {
  purpose: PersonPackPurpose;
  generatedAt: Date;
  detail: PersonDetail;
  compliance: ComplianceScore;
  documents: PersonPackDocument[];
  openTasks: TaskRow[];
  personalTodos: PersonPackTodo[];
  drafts: PersonPackDraft[];
  recommendedSelection: PersonPackSectionSelection;
  counts: {
    missingDocuments: number;
    documentIssues: number;
    linkedDocuments: number;
    openTasks: number;
    personalTodos: number;
    drafts: number;
  };
};

export function defaultPersonPackSelection(
  purpose: PersonPackPurpose,
  personType: PersonDetail["person"]["personType"]
): PersonPackSectionSelection {
  const s = blankPersonPackSelection();

  if (purpose === "document-request") {
    s.missingDocuments = true;
    s.documentIssues = true;
    s.linkedDocuments = true;
    s.deadlines = true;
    s.fileLinks = true;
    s.contactDetails = true;
    return s;
  }

  if (purpose === "visa-permit") {
    s.missingDocuments = true;
    s.documentIssues = true;
    s.linkedDocuments = true;
    s.openTasks = true;
    s.personalTodos = true;
    s.deadlines = true;
    s.fileLinks = true;
    s.companyContext = true;
    s.contactDetails = true;
    return s;
  }

  if (purpose === "recruitment") {
    s.missingDocuments = true;
    s.documentIssues = true;
    s.linkedDocuments = true;
    s.personalTodos = true;
    s.deadlines = true;
    s.contactDetails = true;
    s.companyContext = true;
    return s;
  }

  if (purpose === "task-reminder") {
    s.openTasks = true;
    s.personalTodos = true;
    s.deadlines = true;
    s.latestUpdates = personType === "internal";
    return s;
  }

  return s;
}

type TodoRow = {
  id: number;
  title: string;
  done: boolean;
  important: boolean | null;
  due_at: string | null;
  company_id: number | null;
  task_id: number | null;
  companies?: { name: string } | { name: string }[] | null;
  tasks?: { code: string } | { code: string }[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function listPersonTodos(personId: number): Promise<PersonPackTodo[]> {
  const { data, error } = await sb
    .from("todos")
    .select("id,title,done,important,due_at,company_id,task_id,companies(name),tasks(code)")
    .eq("person_id", personId)
    .eq("done", false)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as TodoRow[]).map((row) => {
    const company = one(row.companies);
    const task = one(row.tasks);
    return {
      id: row.id,
      title: row.title,
      done: row.done,
      important: row.important ?? false,
      dueAt: row.due_at ? new Date(row.due_at) : null,
      companyId: row.company_id,
      companyName: company?.name ?? null,
      taskId: row.task_id,
      taskCode: task?.code ?? null,
    };
  });
}

type DraftRow = {
  id: number;
  channel: string;
  subject: string | null;
  source: string | null;
  created_at: string;
  sent_at: string | null;
  status: string;
};

async function listPersonDrafts(personId: number): Promise<PersonPackDraft[]> {
  const { data, error } = await sb
    .from("outbox")
    .select("id,channel,subject,source,created_at,sent_at,status")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);

  return ((data ?? []) as DraftRow[]).map((row) => ({
    id: row.id,
    channel: row.channel as Channel,
    subject: row.subject,
    source: row.source,
    createdAt: new Date(row.created_at),
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    status: row.status,
  }));
}

async function companyNameMap(): Promise<Map<number, string>> {
  const { data, error } = await sb.from("companies").select("id,name");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.id as number, row.name as string]));
}

function personDocuments(
  documents: DocumentRow[],
  companyNames: Map<number, string>,
  personId: number
): PersonPackDocument[] {
  return documents
    .filter((doc) => doc.personId === personId && !doc.archived)
    .map((doc) => ({
      ...doc,
      companyName: doc.companyId ? companyNames.get(doc.companyId) ?? null : null,
      status: deriveDocStatus(doc),
      expiryLabel: expiryLabel(doc),
    }));
}

export async function getPersonPack(
  personId: number,
  purpose: PersonPackPurpose = "document-request"
): Promise<PersonPack | null> {
  const [detail, documents, todos, drafts, companies] = await Promise.all([
    getPersonDetail(personId),
    listDocuments(),
    listPersonTodos(personId),
    listPersonDrafts(personId),
    companyNameMap(),
  ]);

  if (!detail) return null;

  const compliance = buildPersonComplianceScores(
    [{ id: detail.person.id, name: detail.person.name, personType: detail.person.personType }],
    documents
  )[0];
  const docs = personDocuments(documents, companies, detail.person.id);
  const openTasks = detail.assignedTasks.filter((task) => isOpen(task.status));

  return {
    purpose,
    generatedAt: new Date(),
    detail,
    compliance,
    documents: docs,
    openTasks,
    personalTodos: todos,
    drafts,
    recommendedSelection: defaultPersonPackSelection(purpose, detail.person.personType),
    counts: {
      missingDocuments: compliance.missing,
      documentIssues: compliance.expired + compliance.expiring,
      linkedDocuments: docs.length,
      openTasks: openTasks.length,
      personalTodos: todos.length,
      drafts: drafts.length,
    },
  };
}
