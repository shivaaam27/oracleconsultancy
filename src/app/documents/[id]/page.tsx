import { redirect } from "next/navigation";

/** An old document link — /documents/12 — opens that file's preview in Files Management. */
export default async function DocumentRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(/^\d+$/.test(id) ? `/files?open=${id}` : "/files");
}
