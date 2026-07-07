import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { consumeUndo } from "@/lib/undo";
import { invalidateAllTasks } from "@/lib/queries";
import "@/lib/undo-handlers";

export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing token." }, { status: 400 });
  }
  const result = await consumeUndo(token);
  if (result.ok) {
    // Undo can touch tasks, outbox or people — cheap to bust all three.
    revalidateTag("tasks", { expire: 0 }); invalidateAllTasks();
    revalidateTag("outbox", { expire: 0 });
    revalidateTag("people", { expire: 0 });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
