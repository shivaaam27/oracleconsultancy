import { sb } from "@/db/supabase";
import { getLibrary } from "@/lib/files";
import { FilesApp, type FilesCompany } from "@/components/files/files-app";

export const dynamic = "force-dynamic";

/** A soft tile per company — the round mark on its folder and in the rail. */
const TILES: [string, string][] = [["#FEF3E0", "#8A5A06"], ["#E4F7EE", "#0E7A4F"], ["#E8F1FD", "#1664B0"], ["#FDEBF4", "#A3226A"], ["#EFE8FF", "#6B46C1"], ["#E6F6F8", "#0E6F7A"], ["#F3F3F1", "#55585E"]];

/**
 * Files Management (replaces "Documents", 24 Sept 2026). Links from elsewhere
 * land in the right place: ?co=4 opens that company's folder, ?pe=9 that
 * person's, ?open=12 previews one file. ⚠️ NOT ?company= / ?person= — those
 * open the global company / person drawer on any page.
 */
export default async function FilesPage({ searchParams }: { searchParams: Promise<{ co?: string; pe?: string; open?: string }> }) {
  const sp = await searchParams;
  const [library, { data: cos }] = await Promise.all([
    getLibrary(),
    sb.from("companies").select("id,name,code_prefix").eq("active", true).order("name"),
  ]);
  const companies: FilesCompany[] = (cos ?? []).map((c, i) => ({
    id: c.id as number,
    name: c.name as string,
    prefix: ((c.code_prefix as string | null) ?? (c.name as string).slice(0, 2)).toUpperCase(),
    tile: TILES[i % TILES.length][0],
    ink: TILES[i % TILES.length][1],
  }));
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
  return <FilesApp library={library} companies={companies} initialOpen={num(sp.open)} initialCompany={num(sp.co)} initialPerson={num(sp.pe)} />;
}
