import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { listDocuments } from "@/lib/documents";
import { deriveDocStatus, expiryLabel } from "@/lib/documents-shared";
import { getCompanyLogoUrl } from "@/lib/company-brand";

export const dynamic = "force-dynamic";

const RANK = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY);

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id");
  const companyId = parseInt(idStr ?? "", 10);
  if (Number.isNaN(companyId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [allRows, documents, { data: companyRaw }, { data: assocRaw }, { data: peopleRaw }] = await Promise.all([
    getAllTasks(),
    listDocuments(),
    sb.from("companies").select("id,name,accent_color,legal_name,registration_no,tin,vrn,address,phone,email").eq("id", companyId).maybeSingle(),
    sb.from("person_companies").select("person_id").eq("company_id", companyId),
    sb.from("people").select("id,company_id,name,role").eq("active", true),
  ]);

  const rows = allRows.filter((r) => r.companyId === companyId);
  if (!companyRaw && rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const name = (companyRaw?.name as string | undefined) ?? rows[0]?.companyName ?? "Company";
  const accent = (companyRaw?.accent_color as string | null) ?? rows[0]?.companyAccent ?? null;

  const open = rows.filter((r) => r.status !== "Completed" && r.status !== "Closed").sort((a, b) => RANK(a.deadline) - RANK(b.deadline));
  const overdue = open.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;

  const companyDocs = documents.filter((d) => d.companyId === companyId);
  const attention = companyDocs
    .map((d) => ({ d, status: deriveDocStatus(d) }))
    .filter((x) => x.status === "Expired" || x.status === "Expiring")
    .sort((a, b) => RANK(a.d.expiryDate) - RANK(b.d.expiryDate))
    .slice(0, 5)
    .map(({ d, status }) => ({ id: d.id, title: d.title, status, expiryLabel: expiryLabel(d) }));

  const teamIds = new Set<number>((assocRaw ?? []).map((r) => r.person_id as number));
  for (const p of peopleRaw ?? []) if ((p.company_id as number | null) === companyId) teamIds.add(p.id as number);

  // Named team list (active people in the team) for the drawer Connections tab.
  const team = (peopleRaw ?? [])
    .filter((p) => teamIds.has(p.id as number))
    .map((p) => ({ id: p.id as number, name: (p.name as string) ?? "—", role: (p.role as string | null) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);

  const logoUrl = await getCompanyLogoUrl(companyId);

  return NextResponse.json({
    company: {
      id: companyId, name, accent, logoUrl,
      legalName: (companyRaw?.legal_name as string | null) ?? null,
      registrationNo: (companyRaw?.registration_no as string | null) ?? null,
      tin: (companyRaw?.tin as string | null) ?? null,
      vrn: (companyRaw?.vrn as string | null) ?? null,
      address: (companyRaw?.address as string | null) ?? null,
      phone: (companyRaw?.phone as string | null) ?? null,
      email: (companyRaw?.email as string | null) ?? null,
    },
    tasks: {
      open: open.length,
      overdue,
      total: rows.length,
      top: open.slice(0, 5).map((r) => ({ code: r.code, actionItem: r.actionItem, deadline: r.deadline ? r.deadline.toISOString() : null, status: r.status, priority: r.priority })),
    },
    documents: { count: companyDocs.length, attention },
    teamCount: teamIds.size,
    team,
  });
}
