import { redirect } from "next/navigation";

// Letterheads merged into the Letters page (June 2026). The server actions in
// ./actions.ts stay here — LetterheadEditor and company pages still use them.
export default function LetterheadsRedirect() {
  redirect("/letters?view=letterheads");
}
