import { notFound } from "next/navigation";
import { getLetter } from "@/lib/letters";
import { LetterEditor } from "@/components/letter-editor";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [letter, { data: companiesRaw }] = await Promise.all([
    getLetter(Number(id)),
    sb.from("companies").select("id,name").order("name"),
  ]);
  if (!letter) notFound();
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  return (
    <div className="py-2">
      <LetterEditor letter={letter} companies={companies} />
    </div>
  );
}
