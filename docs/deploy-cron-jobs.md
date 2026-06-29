# Scheduled jobs (cron-job.org)

GitHub Actions schedules were replaced by **HTTP cron endpoints** on Vercel, triggered by [cron-job.org](https://cron-job.org) (or any scheduler).

## 1. Vercel environment

Add to **Vercel → Project → Environment Variables** (Production + Preview if needed):

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Long random string; required on every cron request |
| `SUPABASE_URL` | Already set |
| `SUPABASE_SERVICE_KEY` | Already set |
| `DISCORD_GUILD_ID` | Settlement + sync |
| `HELIUS_API_KEY` | NFT sync |
| `MUTANT_APES_COLLECTION_MINT` | NFT sync |
| `COLLECTION_NAME` | NFT sync (optional) |
| `DISCORD_BOT_TOKEN` | Discord role reconciliation |
| `DISCORD_XMA_*` | Accrual rates (optional; defaults apply) |
| `DAILY_GRANT_TIMEZONE` | Optional; default `America/New_York` |

Generate a secret:

```bash
openssl rand -hex 32
```

## 2. Endpoints

Replace `https://www.xapelabz.com` with your live site if different.

| Job | URL | Method |
|-----|-----|--------|
| XMA accrual | `/api/cron/accrue-xma` (rewrites to `api/cron-accrue-xma.js`) | GET or POST |
| XMA settlement | `/api/cron/settle-xma` | GET or POST |
| NFT + roles sync | `/api/cron/sync-nfts` | GET or POST |

Cron routes are served through `api/dashboard.js` (same as `/api/prices`), via `vercel.json` rewrites.

**Auth header** (required):

```
Authorization: Bearer YOUR_CRON_SECRET
```

Alternative header: `x-cron-secret: YOUR_CRON_SECRET`

### Accrual query params

- `maxBatches` — RPC batches per request (default **1** on HTTP; safe for serverless). Cron every 5 minutes drains the queue steadily.

Example test:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.xapelabz.com/api/cron/accrue-xma"
```

## 3. cron-job.org setup

Create a free account → **Cronjobs** → **Create cronjob** for each job.

### XMA accrual (every 5 minutes)

| Field | Value |
|-------|-------|
| URL | `https://https://www.xapelabz.com/api/cron/accrue-xma` |
| Schedule | Every 5 minutes (`*/5 * * * *`) |
| Request method | GET |
| Headers | `Authorization: Bearer YOUR_CRON_SECRET` |

### XMA settlement (twice daily, Eastern)

Settles **yesterday** in America/New_York.

| Field | Value |
|-------|-------|
| URL | `https://https://www.xapelabz.com/api/cron/settle-xma` |
| Schedule | `35 0 * * *` and `35 12 * * *` |
| Timezone | **America/New_York** (00:35 and 12:35 ET) |
| Headers | `Authorization: Bearer YOUR_CRON_SECRET` |

Create **two** cron jobs (or one job + duplicate with second schedule if your plan supports it).

### NFT + Discord roles sync (every 15 minutes)

| Field | Value |
|-------|-------|
| URL | `https://https://www.xapelabz.com/api/cron/sync-nfts` |
| Schedule | Every 15 minutes (`*/15 * * * *`) |
| Headers | `Authorization: Bearer YOUR_CRON_SECRET` |

**Note:** `sync-nfts` can run up to 5 minutes on Vercel Pro (`maxDuration: 300`). Hobby plan may time out on large collections.

## 4. Local CLI (optional)

Scripts still work for manual runs:

```bash
npm run accrue-discord-xma-rewards   # all batches until empty
npm run settle-discord-xma-daily
npm run sync-nfts
```

## 5. GitHub Actions

The workflows under `.github/workflows/` for these jobs are **removed**. Use cron-job.org + Vercel endpoints only.
