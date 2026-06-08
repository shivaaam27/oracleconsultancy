import { PageHeader } from "@/components/ui";
import { LettersList } from "@/components/letters-list";
import { listLetters } from "@/lib/letters";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function LettersPage() {
  const [letters, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listLetters(),
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const drafts = letters.filter((l) => l.status === "Draft").length;

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Letters" sub={`${letters.length} total · ${drafts} draft${drafts === 1 ? "" : "s"} · branded per company`} />
      <LettersList letters={letters} companies={companies} people={people} />
    </div>
  );
}
