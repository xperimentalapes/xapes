# Deploy Discord Gateway on Fly.io

## Can this run on Vercel or Supabase?

**No.** The Discord bot uses **discord.js**, which opens a **long-lived outbound WebSocket** to Discord. Vercel serverless and Supabase Edge Functions are HTTP-only and cannot hold that connection.

Keep the Gateway on a small always-on host (Fly.io, VPS, PM2 at home). Supabase stays the **database** the bot writes to. The website, APIs, slash commands, and cron accrual stay on **Vercel**.

---

## Fly.io setup

Expect roughly **$2–5/month** for one small always-on machine (`shared-cpu-1x`, 256MB). Fly bills per second while the machine runs.

**Payment method required:** add a card at [fly.io/dashboard/personal/billing](https://fly.io/dashboard/personal/billing) before deploy. Without it, launch/deploy will fail with an organization limit error.

### 1. Install the Fly CLI (once)

There is **no official npm package** for Fly. On older Macs without Homebrew, use the official installer:

```bash
curl -L https://fly.io/install.sh | sh
```

Then add Fly to your PATH (the installer prints these lines — add them to `~/.zshrc` if you don't have one yet):

```bash
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
```

Open a **new terminal** (or run `source ~/.zshrc`), then verify:

```bash
fly version
```

Optional if you have Homebrew: `brew install flyctl`

### 2. Log in (opens browser)

```bash
fly auth login
```

Or from this repo after PATH is set:

```bash
cd /path/to/xapes
npm run fly:login
```

**Headless / CI:** create a token in Fly → Account → **Access Tokens**, then:

```bash
export FLY_API_TOKEN="your_token_here"
npm run deploy:gateway:fly
```

### 3. Create the app (once)

`fly.toml` is already in the repo. Link it to your Fly account:

```bash
npm run fly:launch
```

This runs `fly launch --no-deploy --copy-config --region iad`. When prompted:

- **App name:** keep `xapes-discord-gateway` or pick another globally unique name (update `app` in `fly.toml` if you change it).
- **Region:** pick one close to you (default `iad` = Virginia).
- **Postgres / Redis:** No — we only need the worker.

### 4. Secrets

Do not commit secrets. Set the same vars as local `.env`:

```bash
npm run fly -- secrets set \
  DISCORD_BOT_TOKEN="..." \
  DISCORD_GUILD_ID="..." \
  SUPABASE_URL="..." \
  SUPABASE_SERVICE_KEY="..."
```

Optional: `DISCORD_ENGAGEMENT_CHANNEL_IDS`, `DISCORD_ENGAGEMENT_IGNORE_CHANNEL_IDS`  
Do **not** set `DISCORD_ENGAGEMENT_DEBUG=1` in production.

| Variable | Required |
|----------|----------|
| `DISCORD_BOT_TOKEN` | Yes |
| `DISCORD_GUILD_ID` | Yes |
| `SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_KEY` | Yes |

### 5. Deploy

```bash
npm run deploy:gateway:fly
```

Or redeploy after any code change on `main`:

```bash
npm run deploy:gateway:fly
```

### 6. Logs and status

```bash
npm run fly:logs
npm run fly:status
```

You should see:

- `[royal-bot-gateway] health check listening on 8080`
- `[engagement] listeners attached for guild …`
- `[royal-bot-gateway] ready as …`

### 7. One Gateway per token

Stop local `npm run royal-bot-gateway` when the Fly app runs, if they share the same `DISCORD_BOT_TOKEN`. Two processes with one token fight each other and events stop recording.

### 8. Verify engagement resumed

Send a test message in Discord (10+ characters in an allowed channel), then check the site XMA section or:

```bash
curl -sS "https://xapes.vercel.app/api/discord-rewards/meta" | jq .engagementTrackingActive
```

Should return `true` within a minute.

---

## Build notes

- **`Dockerfile.gateway`** — worker image only (not the static site `npm run build`).
- **`fly.toml`** — `auto_stop_machines = "off"` so the bot stays connected 24/7.
- **`PORT=8080`** — health check `GET /` returns `ok` (see `scripts/royal-bot-gateway.js`).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Machine keeps restarting | `npm run fly:logs` — usually missing secrets or invalid `DISCORD_BOT_TOKEN` |
| `ready as` but no events | Check guild ID, channel whitelist/blacklist, message length ≥ 10 chars |
| Health check failing | Ensure `PORT` is 8080 and process binds `0.0.0.0` |
| Two bots connected | Stop duplicate local or old deploy using same token |
