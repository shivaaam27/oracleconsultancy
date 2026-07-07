// /api/telegram/webhook — INBOUND Telegram bridge for ORI (Phase 6c scaffold).
//
// PURPOSE: let the owner ask ORI a READ-ONLY question from Telegram and get the
// answer back in the same chat. This is a deliberately minimal, SAFE scaffold —
// it forwards to the admin ORI ASK path (/api/ask, read-only) and NEVER executes
// writes, sends nothing external except the reply to the originating chat, and is
// COMPLETELY INERT unless its env is set (no token = a 200 no-op, zero cost, no
// data exposed).
//
// ── REQUIRED ENV (all must be set to activate; otherwise this route no-ops) ────
//   TELEGRAM_BOT_TOKEN     — the bot token from @BotFather (used to call sendMessage).
//   TELEGRAM_WEBHOOK_SECRET — a random shared secret you invent; Telegram echoes it
//                             back in the `X-Telegram-Bot-Api-Secret-Token` header on
//                             every delivery, and we reject any request that doesn't
//                             match. Generate one, e.g.:  openssl rand -hex 24
//   NEXT_PUBLIC_APP_URL    — the app's public base URL (used to reach /api/ask).
//                             Falls back to the request origin if unset.
//
// ── ONE-TIME SETUP the owner must run (replace <…> placeholders) ──────────────
//   Register this route as the bot's webhook AND bind the secret in a single call:
//
//     curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
//       -d "url=https://<your-app-domain>/api/telegram/webhook" \
//       -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
//
//   To stop it later:  curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
//
// British English throughout. Read-only for now — do NOT wire task writes here.

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const TELEGRAM_API = "https://api.telegram.org";
const MAX_REPLY_CHARS = 3500; // Telegram hard limit is 4096; keep headroom.

type TgChat = { id: number | string };
type TgMessage = { chat?: TgChat; text?: string };
type TgUpdate = { message?: TgMessage; edited_message?: TgMessage };

/** Send a plain-text reply back to the originating Telegram chat. Best-effort. */
async function sendMessage(token: string, chatId: number | string, text: string) {
  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, MAX_REPLY_CHARS),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error("Telegram sendMessage failed:", e);
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // INERT unless fully configured — a 200 no-op so Telegram doesn't retry, and we
  // touch nothing (no DB, no AI, no data exposed) when the owner hasn't set it up.
  if (!token || !secret) {
    return NextResponse.json({ ok: false, reason: "telegram not configured" });
  }

  // Verify Telegram's echoed secret header. A mismatch means the caller isn't our
  // bound webhook — reject before doing any work.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false, reason: "bad secret" }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    // Malformed body — ack so Telegram stops retrying, but do nothing.
    return NextResponse.json({ ok: true });
  }

  const msg = update.message ?? update.edited_message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? "").toString().trim();

  // Nothing actionable (no text, e.g. a sticker/photo, or no chat) — silent ack.
  if (chatId == null || !text) {
    return NextResponse.json({ ok: true });
  }

  // Forward to the admin ORI ASK path — READ-ONLY. We call the same /api/ask
  // endpoint the command centre uses (non-streaming) rather than importing its
  // server internals, keeping this scaffold self-contained. It never writes.
  try {
    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
    const askRes = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
      signal: AbortSignal.timeout(55000),
    });

    if (askRes.ok) {
      const data = (await askRes.json().catch(() => null)) as { answer?: string } | null;
      const answer = data?.answer?.trim();
      await sendMessage(
        token,
        chatId,
        answer || "I couldn't find anything on that just now.",
      );
    } else if (askRes.status === 503) {
      await sendMessage(token, chatId, "ORI's AI isn't switched on at the moment.");
    } else {
      await sendMessage(token, chatId, "Something went wrong reaching ORI — try again shortly.");
    }
  } catch (e) {
    console.error("Telegram → /api/ask failed:", e);
    await sendMessage(token, chatId, "Something went wrong reaching ORI — try again shortly.");
  }

  // Always 200 so Telegram treats the update as delivered (we've already replied
  // in-chat with any error). Returning non-200 would make Telegram retry the same
  // update, causing duplicate ORI answers.
  return NextResponse.json({ ok: true });
}
