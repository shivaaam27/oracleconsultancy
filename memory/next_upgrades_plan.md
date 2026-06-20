# Next upgrades — Proactive synthesis + anomaly radar, and Telegram/voice ORI (PLANNED)

Owner's chosen next directions (Jun 2026), after the 7-wave ORI brain shipped (`memory/ori_brain.md`).
Owner picked: **(A) Proactive synthesis + anomaly radar** ("librarian → chief of staff") and
**(B) Telegram + voice ORI** ("the system you actually reach for, from your phone"). Owner said
**Telegram, NOT WhatsApp** (WhatsApp Business API = Meta approval + provider + templates + cost;
Telegram Bot API = free, instant, no approval, webhook-simple). Status: PLANNED, not built. Owner
asked to plan first; decisions still to lock (see foot).

## Plan A — Proactive synthesis + anomaly radar
Build on what exists: `daily_snapshots` (per-company KPI history = baseline), `task_updates`/`facts`
(timelines), `system_events`/`automation_events`, `gatherSafetyFindings`, the `morning-run` cron
(already composes + sends a brief), and the **semantic index** (`hybridSearch`) for precedent matching.

- **A1 — Anomaly radar (deterministic, free, ship first).** NEW `src/lib/anomaly-radar.ts`: rule-based
  signals from existing data, each `{severity, entity, what, why, suggestedAction}`: task reopened ≥3×
  / stuck > N days; a company's open/overdue spiking vs its `daily_snapshots` baseline; compliance
  score dropping; doc expiring with no renewal task; recurring blocker phrase across tasks/companies;
  a person whose tasks all stalled. Runs in morning cron; works AI-off. Surfaces as an "ORI's read"
  Aurora card on home/`/inbox` (ranked, every-number-a-door).
- **A2 — Synthesis narrative (LLM on top).** Feed anomalies + snapshot deltas to ORI (GROQ_SMART via
  the ai-json harness + ai-verify anti-hallucination + spend cap) → a short decision-grade paragraph
  citing task codes. Degrades to the raw A1 list when AI off.
- **A3 — Precedent matching ("same as MES in April").** Embed the current situation, `hybridSearch`
  over HISTORICAL task_updates/meetings → "this resembles X; last time Y resolved it." Pure reuse of
  the index.
- **A4 — Learning.** Dismiss an anomaly type → suppress (like `routing_corrections`); track which
  alerts were acted on so the radar self-tunes. Biggest risk = NOISE (a radar that cries wolf gets
  ignored) → start conservative thresholds, let A4 tune.
- Safety: suggests only, never acts (Tier-3 untouched). Tiny migration (stored daily reads +
  suppressions) or reuse `ai_memory`/`system_events`.

## Plan B — Telegram + voice ORI
Build on: `/api/ask` + `/api/action` ARE the brain as HTTP endpoints (extract the core into shared
libs so web + Telegram + voice share ONE brain); guardrails (`canAutoSend`, spend cap, Tier-3) already
exist; `push.ts` for outbound; Groq Whisper for voice transcription.

- **B1 — Bot + read-only ORI (biggest value, lowest risk).** NEW `/api/telegram/webhook`. SECURITY =
  the heart: reply ONLY to whitelisted Telegram chat IDs (owner registers theirs once via an app code;
  store allowed ids in settings/a table) + verify Telegram's secret-token header. This replaces the
  password/cookie gate for the bot channel. Text question → ORI answer (with passage citations + graph
  + memory).
- **B2 — Actions with confirm.** "mark DS-003 done" → reply with Telegram **inline Confirm/Cancel
  buttons** (perfect Propose→confirm→act surface). Tier-3 stays gated; external sends via `canAutoSend`.
- **B3 — Voice-note input.** Telegram voice note → download file → transcribe via **Groq Whisper**
  (reuse getGroqKey + ai-json) → treat as text → answer. Voice REPLIES (TTS) = optional P5 (needs a TTS
  provider; text replies fine to start).
- **B4 — Proactive push to Telegram (A meets B).** Morning "ORI's read" + urgent anomalies delivered to
  Telegram (respecting quiet hours + digest). `sendTelegram(chatId, text)` helper. This is the payoff:
  Plan A delivered through Plan B.
- Owner setup (only owner can do): create the bot in BotFather (gives a token), paste token + register
  chat id in Settings. Infra: Telegram free; Vercel webhook fine; public URL already exists
  (cos-system-one.vercel.app); Groq Whisper cheap/free-tier.

## Recommended build order
1. A1 + A2 (radar + synthesis) — value now, no external setup.
2. B1 (Telegram read-only ORI) — once the bot token exists.
3. B4 (proactive read pushed to Telegram) — A delivered through B.
4. Then B2 (actions), A3 (precedent), B3 (voice), A4 (learning).

## Decisions to lock before building
- Telegram bot: owner happy to make the bot in BotFather (2 min)?
- Voice replies: text-only to start, or ORI talks back (TTS provider needed)?
- Bot access: owner-only, or staff later (changes auth model)?
- Build order: recommendation above, or Telegram-first (phone-first)?

## Other parked upgrades (mentioned, not chosen)
Runtime multi-agent ORI (fan out specialist sub-agents for hard asks — the workflow pattern we used to
BUILD this, at runtime); structured table/line-item extraction from documents; native multilingual
embeddings (S5 EU container ~£3-7/mo); auto model selection via the eval harness; autonomy L3→L4
(trust dial that moves with track record). See `memory/ori_brain.md` follow-ups + `memory/intelligenceupgrade.md`.
