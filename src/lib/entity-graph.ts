// Entity knowledge graph (no AI): assembles everything the system knows about a
// company or person and how it connects — people, companies, documents, facts,
// compliance, in-flight applications, and other companies that share a director.
// Read-only and traversable: every connected entity links to its own graph.

import { sb } from "@/db/supabase";
import { getCompanyRelationships, getPersonRelationships } from "@/lib/relationships";
import { listDocuments } from "@/lib/documents";
import { currentFacts } from "@/lib/facts";

export type GraphNode = { kind: "company" | "person" | "document" | "fact" | "pipeline"; id: string; label: string; sub?: string | null; href?: string };
export type GraphGroup = { title: string; nodes: GraphNode[] };
export type EntityGraph = { center: { kind: "company" | "person"; id: number; label: string; sub?: string | null }; groups: GraphGroup[] };

const personHref = (id: number) => `/graph?type=person&id=${id}`;
const companyHref = (id: number) => `/graph?type=company&id=${id}`;

export async function getEntityGraph(kind: "company" | "person", id: number): Promise<EntityGraph | null> {
  return kind === "company" ? companyGraph(id) : personGraph(id);
}

async function companyGraph(id: number): Promise<EntityGraph | null> {
  const { data: co } = await sb.from("companies").select("id,name,legal_name").eq("id", id).maybeSingle();
  if (!co) return null;
  const name = co.name as string;
  const groups: GraphGroup[] = [];

  // People — from filings (directors/shareholders/secretary) + staff on the books.
  const rels = await getCompanyRelationships(id);
  const peopleNodes: GraphNode[] = [];
  const seenPeople = new Set<number>();
  for (const r of rels) {
    if (r.personId) { if (seenPeople.has(r.personId)) continue; seenPeople.add(r.personId); peopleNodes.push({ kind: "person", id: `p${r.personId}`, label: r.name, sub: r.detail ? `${r.role} · ${r.detail}` : r.role, href: personHref(r.personId) }); }
    else peopleNodes.push({ kind: "person", id: `n${r.role}-${r.name}`, label: r.name, sub: `${r.role} · not on file` });
  }
  const { data: staff } = await sb.from("people").select("id,name,role").eq("active", true).eq("company_id", id);
  for (const s of staff ?? []) { const pid = s.id as number; if (seenPeople.has(pid)) continue; seenPeople.add(pid); peopleNodes.push({ kind: "person", id: `p${pid}`, label: s.name as string, sub: (s.role as string | null) ?? "Staff", href: personHref(pid) }); }
  if (peopleNodes.length) groups.push({ title: "People", nodes: peopleNodes });

  // Other companies sharing a director with this one (the cross-company link).
  const directorIds = new Set(rels.filter((r) => r.role === "Director" && r.personId).map((r) => r.personId as number));
  if (directorIds.size) {
    const { data: cos } = await sb.from("companies").select("id,name").neq("id", id);
    const linked: GraphNode[] = [];
    for (const c of cos ?? []) {
      const cr = await getCompanyRelationships(c.id as number);
      const shared = cr.filter((r) => r.role === "Director" && r.personId && directorIds.has(r.personId)).map((r) => r.name);
      if (shared.length) linked.push({ kind: "company", id: `c${c.id}`, label: c.name as string, sub: `shared director: ${shared.join(", ")}`, href: companyHref(c.id as number) });
    }
    if (linked.length) groups.push({ title: "Linked companies (shared directors)", nodes: linked });
  }

  // Documents (count + a few recent).
  const docs = (await listDocuments()).filter((d) => d.companyId === id && !d.archived);
  if (docs.length) {
    const recent = [...docs].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 6);
    groups.push({ title: `Documents (${docs.length})`, nodes: recent.map((d) => ({ kind: "document", id: `d${d.id}`, label: d.title, sub: d.category, href: `/documents?company=${id}` })) });
  }

  // Facts (current values).
  const facts = await currentFacts({ type: "company", id });
  if (facts.length) groups.push({ title: "Facts", nodes: facts.slice(0, 10).map((f) => ({ kind: "fact", id: `f${f.id}`, label: f.field, sub: f.display })) });

  // In-flight applications.
  const { data: pipe } = await sb.from("pipeline").select("id,type,stage").eq("company_id", id).eq("archived", false);
  if (pipe && pipe.length) groups.push({ title: "Applications in progress", nodes: pipe.map((p) => ({ kind: "pipeline", id: `pl${p.id}`, label: p.type as string, sub: p.stage as string, href: "/hrms/pipeline" })) });

  return { center: { kind: "company", id, label: name, sub: (co.legal_name as string | null) ?? null }, groups };
}

async function personGraph(id: number): Promise<EntityGraph | null> {
  const { data: p } = await sb.from("people").select("id,name,role,company_id,manager_id").eq("id", id).maybeSingle();
  if (!p) return null;
  const name = p.name as string;
  const groups: GraphGroup[] = [];

  // Companies — directorships/roles inferred from filings + primary + associations.
  const rels = await getPersonRelationships(id);
  const seenCo = new Set<number>();
  const coNodes: GraphNode[] = [];
  for (const r of rels) { if (seenCo.has(r.companyId)) continue; seenCo.add(r.companyId); coNodes.push({ kind: "company", id: `c${r.companyId}`, label: r.companyName, sub: r.role, href: companyHref(r.companyId) }); }
  if (p.company_id && !seenCo.has(p.company_id as number)) {
    const { data: c } = await sb.from("companies").select("name").eq("id", p.company_id as number).maybeSingle();
    if (c) { seenCo.add(p.company_id as number); coNodes.push({ kind: "company", id: `c${p.company_id}`, label: c.name as string, sub: "Employer", href: companyHref(p.company_id as number) }); }
  }
  if (coNodes.length) groups.push({ title: "Companies", nodes: coNodes });

  // Manager + direct reports.
  const peopleNodes: GraphNode[] = [];
  if (p.manager_id) { const { data: m } = await sb.from("people").select("name").eq("id", p.manager_id as number).maybeSingle(); if (m) peopleNodes.push({ kind: "person", id: `p${p.manager_id}`, label: m.name as string, sub: "Reports to", href: personHref(p.manager_id as number) }); }
  const { data: reports } = await sb.from("people").select("id,name,role").eq("manager_id", id).eq("active", true);
  for (const r of reports ?? []) peopleNodes.push({ kind: "person", id: `p${r.id}`, label: r.name as string, sub: `Direct report${r.role ? ` · ${r.role}` : ""}`, href: personHref(r.id as number) });
  if (peopleNodes.length) groups.push({ title: "People", nodes: peopleNodes });

  // Documents.
  const docs = (await listDocuments()).filter((d) => d.personId === id && !d.archived);
  if (docs.length) {
    const recent = [...docs].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 6);
    groups.push({ title: `Documents (${docs.length})`, nodes: recent.map((d) => ({ kind: "document", id: `d${d.id}`, label: d.title, sub: d.category, href: `/documents?person=${id}` })) });
  }

  // Facts.
  const facts = await currentFacts({ type: "person", id });
  if (facts.length) groups.push({ title: "Facts", nodes: facts.slice(0, 10).map((f) => ({ kind: "fact", id: `f${f.id}`, label: f.field, sub: f.display })) });

  return { center: { kind: "person", id, label: name, sub: (p.role as string | null) ?? null }, groups };
}
