# Running ORI 24/7 (PC off) — always-on host setup

The ORI worker is just scripts. To make it answer **round-the-clock with your PC
off**, run the **dispatcher** (`scripts/agent-dispatcher.ts`) on a machine that's
always on. It watches the queue and wakes a Claude worker the instant a job lands —
and spends **zero tokens while idle**.

Any always-on host works: a ~$5/month cloud VPS (DigitalOcean/Hetzner/etc.), a
Raspberry Pi, or a spare PC you leave on.

## One-time setup on the host

```bash
# 1. Install Node 20+ and git, then clone the repo
git clone https://github.com/shivaaam27/oracleconsultancy.git
cd oracleconsultancy
npm install

# 2. Create .env.local with the Supabase creds (same values as your dev machine)
cat > .env.local <<'ENV'
DATABASE_URL=...            # Supabase pooler, port 6543
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
AGENT_TRIGGER_SECRET=...    # any long random string
ENV

# 3. Install the Claude CLI and log in with your MAX plan (one time)
#    (this is what runs on the Max plan — no API key/bill)
npm i -g @anthropic-ai/claude-code      # or the current install command
claude   # sign in with your Max account, then exit

# 4. Prove it works once
npx tsx scripts/agent-dispatcher.ts
#    → "[dispatcher] up — polling every 3000ms. Waiting for jobs…"
#    Queue an ask from the app; within ~3s it wakes the worker and answers.
```

## Keep it running forever (systemd — Linux)

```ini
# /etc/systemd/system/ori-dispatcher.service
[Unit]
Description=ORI dispatcher
After=network-online.target

[Service]
WorkingDirectory=/home/YOU/oracleconsultancy
ExecStart=/usr/bin/npx tsx scripts/agent-dispatcher.ts
Restart=always
RestartSec=5
Environment=DISPATCH_INTERVAL_MS=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now ori-dispatcher
sudo journalctl -u ori-dispatcher -f     # watch it live
```

(Windows/Mac: run it under **pm2** — `npm i -g pm2 && pm2 start "npx tsx scripts/agent-dispatcher.ts" --name ori && pm2 save && pm2 startup`.)

## How it behaves
- **Idle:** polls a counter every ~3s. No Claude session, no tokens.
- **Job appears:** wakes one headless Claude worker (`claude -p …`) that drains the
  whole queue per `AGENT_WORKER.md`, then goes back to watching.
- **PC off:** irrelevant — this host is what's running, not your laptop.
- **Cost:** only the Claude worker runs (Max plan), and only when there's work.

## Re-auth
The Max login on the host expires occasionally (weeks). When the worker starts
failing auth, run `claude` on the host and sign in again.

## Turn off the local scheduler once this is live
When the dispatcher is running 24/7, disable the local `ori-worker` scheduled task
(Claude sidebar → Scheduled) so you're not running two workers.
