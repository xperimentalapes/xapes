# Deploy Discord Gateway on Railway

## Can this run on Supabase?

**No.** Supabase gives you Postgres, Auth, Edge Functions, etc. The Discord bot uses **discord.js**, which opens a **long-lived outbound WebSocket** to Discord. Nothing in Supabase is meant to host that:

- **Edge Functions** are short HTTP handlers (cold starts, time limits), not 24/7 sockets.
- **Postgres** cannot execute your Node bot.

Keep the Gateway on a small always-on host (Railway, VPS, PM2 at home). Supabase stays the **database** the bot already writes to.

---

## Railway (free trial / credits)

Railway’s pricing changes over time; they often give **trial credit** and may ask for a **card**. Use an org/account **you** control.

### 1. CLI from this repo (no global install)

From the repo root, the Railway CLI is run via **`npx`**:

```bash
cd /path/to/xapes

# Log in (opens browser unless you use a token — see below)
npm run railway:login

# Create a new empty project + link this directory (follow prompts)
npm run railway:init

# Or link an existing project / environment
npm run railway:link
```

**Headless / CI:** create a token in Railway → Account → **Tokens**, then:

```bash
export RAILWAY_TOKEN="your_token_here"
npm run railway:link   # once, to pick project/environment
npm run deploy:gateway:railway
```

### 2. New project (dashboard or CLI)

**Dashboard:** [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select `xapes` (or empty project → connect repo).

**CLI:** `npm run railway:init` (or `npm run railway -- init`) after login.

Create/link a **dedicated** project used only for this worker.

### 3. Build settings (important)

This repo’s default `npm run build` is for the **static site**, not the bot. This repo includes **`railway.json`** so Railway uses **`Dockerfile.gateway`** (not the default `Dockerfile`) and **`npm run royal-bot-gateway`** instead of `npm start` (Express).

In the service **Settings → Build**:

- **Builder:** Dockerfile  
- **Dockerfile path:** `Dockerfile.gateway`  

If logs still show `npm start` / `apps/web/server.js`, open **Settings → Build** and set **Builder** to **Dockerfile** and **Dockerfile path** to `Dockerfile.gateway`, and **Deploy → Custom Start Command** to `npm run royal-bot-gateway`, then redeploy. **`railway.json` in the repo should override this on the next deploy** once it is on the default branch.

### 4. Variables

**Dashboard:** **Variables** tab on the service.

**CLI** (from repo root; values are not echoed if you paste carefully):

```bash
npm run railway -- variables set DISCORD_BOT_TOKEN="..." DISCORD_GUILD_ID="..." SUPABASE_URL="..." SUPABASE_SERVICE_KEY="..."
```

Or set them one at a time. Do not commit secrets.

**Dashboard / CLI**, add (same names as local `.env`):

| Variable | Required |
|----------|----------|
| `DISCORD_BOT_TOKEN` | Yes |
| `DISCORD_GUILD_ID` | Yes |
| `SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_KEY` | Yes |

Optional: `DISCORD_ENGAGEMENT_CHANNEL_IDS`, `DISCORD_ENGAGEMENT_IGNORE_CHANNEL_IDS`  
Do **not** set `DISCORD_ENGAGEMENT_DEBUG=1` in production.

Railway injects **`PORT`** at runtime. The gateway listens on `PORT` when set (and Dockerfile exposes 8080) so health checks can pass.

### 5. Deploy

Push to the connected branch, or:

```bash
railway up
```

### 6. Logs

Dashboard **Deployments → View logs**, or:

```bash
railway logs
```

You should see `[engagement] listeners attached` and `[royal-bot-gateway] ready as …`.

### 7. One Gateway per token

Stop local `npm run royal-bot-gateway` when this Railway service runs, if they share the same `DISCORD_BOT_TOKEN`.
