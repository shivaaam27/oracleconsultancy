import { NextRequest, NextResponse } from "next/server";
import { findSimilarTasks } from "@/lib/ai-context";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query: string = (body?.query ?? "").toString();
    const excludeId: number | undefined = body?.excludeId ? Number(body.excludeId) : undefined;
    if (!query || query.length < 3) return NextResponse.json({ tasks: [] });

    const tasks = await findSimilarTasks(query, excludeId, 5);
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("Similar tasks error:", e);
    return NextResponse.json({ tasks: [] }, { status: 500 });
  }
}
