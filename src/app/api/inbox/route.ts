// /api/inbox — secure ingest for forwarded emails and shared WhatsApp items.
//
// A free "bridge" (Gmail Apps Script, or an iOS Shortcut) POSTs here with the
// shared secret. The item is stored as "pending" and a push alert fires so the
// operator knows there's something to file. Opening COS shows it in the Inbox,
// which launches the Capture Wizard pre-filled.

import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { sendToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

function authorise(req: NextRequest): boolean {
  const secret = process.env.INBOX_SECRET;
  if (!secret) return false; // closed unless explicitly configured
  const header = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  const qToken = url.searchParams.get("token") || "";
  return header === `Bearer ${secret}` || qToken === secret;
}

export async function POST(req: NextRequest) {
  if (!authorise(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const source = ["email", "whatsapp", "share", "manual"].includes(body.source) ? body.source : "share";
  const text = (body.body ?? body.text ?? "").toString().trim();
  const subject = (body.subject ?? "").toString().trim() || null;
  const sender = (body.sender ?? body.from ?? "").toString().trim() || null;
  const attachments = Array.isArray(body.attachments) ? JSON.stringify(body.attachments) : null;

  if (!text && !attachments) {
    return NextResponse.json({ error: "Nothing to capture (empty body)" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("inbox")
    .insert({
      source,
      status: "pending",
      sender,
      subject,
      body: text || "(no text — see attachment)",
      attachments,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget push so the operator is alerted (never blocks the response).
  const label = subject || (text ? text.slice(0, 60) : "New item");
  void sendToAll({
    title: source === "email" ? "New email to file" : "New item to file",
    body: label,
    url: "/inbox",
    tag: "cos-inbox",
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: data.id });
}
