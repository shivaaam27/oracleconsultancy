// Director Brief notes — operator-written narrative (Admin/HR "updates" that are
// not tasks). Stored in `brief_notes`; surfaced in the brief between Delivered
// and Open work, and in the share text/PDF. `noteDate` decides which period a
// note belongs to; `companyId` is optional (NULL = portfolio-wide).
import { sb } from "@/db/supabase";

export type BriefNote = {
  id: number;
  body: string;
  companyId: number | null;
  companyName: string | null;
  noteDate: Date;
};

/**
 * Notes whose `noteDate` falls inside the brief window, honouring the company
 * filter. A note tagged to a company shows only when that company is selected
 * or when viewing the whole portfolio; portfolio-wide notes always show.
 */
export async function listBriefNotes(
  range: { start: Date; end: Date },
  selectedCompanyId: number | null,
  companyNameById: Map<number, string>
): Promise<BriefNote[]> {
  let q = sb
    .from("brief_notes")
    .select("id,body,company_id,note_date")
    .gte("note_date", range.start.toISOString())
    .lte("note_date", range.end.toISOString())
    .order("note_date", { ascending: false });
  if (selectedCompanyId) q = q.or(`company_id.eq.${selectedCompanyId},company_id.is.null`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const companyId = (r.company_id as number | null) ?? null;
    return {
      id: r.id as number,
      body: r.body as string,
      companyId,
      companyName: companyId ? companyNameById.get(companyId) ?? null : null,
      noteDate: new Date(r.note_date as string),
    };
  });
}
