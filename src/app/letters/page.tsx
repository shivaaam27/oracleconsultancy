import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { LettersList } from "@/components/letters-list";
import { LettersTabs } from "@/components/letters-tabs";
import { LetterheadEditor } from "@/components/letterhead-editor";
import { listLetters } from "@/lib/letters";
import { listCompanyLetterheads } from "@/app/letterheads/actions";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string }>;
}) {
  const { view, from } = await searchParams;
  const [letters, letterheads, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listLetters(),
    listCompanyLetterheads(),
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const drafts = letters.filter((l) => l.status === "Draft").length;
  const readyLetterheads = letterheads.filter((c) => c.address && c.signatoryName).length;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Letters"
        sub={`${letters.length} total · ${drafts} draft${drafts === 1 ? "" : "s"} · branded per company`}
      />
      <LettersTabs
        initial={view === "letterheads" ? "letterheads" : "letters"}
        letterCount={letters.length}
        letterheadReadyCount={readyLetterheads}
        letterheadTotal={letterheads.length}
        lettersSlot={<LettersList letters={letters} companies={companies} people={people} />}
        letterheadsSlot={
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">
              These details appear at the top of every letter for the company. You can also edit them
              while writing a letter — changes save back here.
            </p>
            {letterheads.map((c) => (
              <LetterheadEditor key={c.id} company={c} />
            ))}
          </div>
        }
      />
    </div>
  );
}
