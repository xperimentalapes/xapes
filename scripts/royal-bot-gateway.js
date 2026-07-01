/**
 * ROYAL BOT — the only long-running Discord Gateway process in this repo.
 *
 * - Engagement → Supabase `discord_engagement_events` via `attachEngagementTracking`
 * - Slash commands: Vercel `POST /api/discord/interactions` (same bot token; no second WebSocket)
 *
 * Run this 24/7 on a host (Fly.io, PM2, screen, etc.); Vercel does not keep a Gateway open.
 * One DISCORD_BOT_TOKEN = one `client.login` session — never two Gateway processes with the same token.
 *
 * Env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Optional: DISCORD_ENGAGEMENT_DISABLED=1 (still logs in; engagement listeners skipped)
 *
 * Extra ROYAL features: add GatewayIntentBits / Partials to EXTRA_* below, then add client.on(...)
 * inside registerRoyalBotGatewayHandlers().
 *
 * Run: npm run royal-bot-gateway
 * Fly.io / other PaaS: PORT set by platform (see Dockerfile.gateway); local dev leaves PORT unset.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/** When PORT is set (e.g. Fly.io health checks), serve GET / → ok. */
const healthPort = process.env.PORT || process.env.GATEWAY_HEALTH_PORT;
if (healthPort) {
  const port = Number(healthPort, 10);
  if (Number.isFinite(port) && port > 0) {
    require('http')
      .createServer(function (_, res) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      })
      .listen(port, '0.0.0.0', function () {
        console.log('[royal-bot-gateway] health check listening on', port);
      });
  }
}

const { Client, Events } = require('discord.js');
const {
  attachEngagementTracking,
  mergeEngagementClientOptions,
} = require('../lib/discord/engagement-gateway');

/** Add ROYAL BOT intents here (e.g. GatewayIntentBits.DirectMessages). Engagement intents are merged in. */
const EXTRA_INTENTS = [];

/** Add ROYAL BOT partials here. Engagement partials are merged in. */
const EXTRA_PARTIALS = [];

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error('[royal-bot-gateway] Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID');
  process.exit(1);
}

if (process.env.DISCORD_ENGAGEMENT_DISABLED !== '1') {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error(
      '[royal-bot-gateway] Engagement enabled: set SUPABASE_URL and SUPABASE_SERVICE_KEY (or DISCORD_ENGAGEMENT_DISABLED=1)'
    );
    process.exit(1);
  }
}

const { intents, partials } = mergeEngagementClientOptions(EXTRA_INTENTS, EXTRA_PARTIALS);

const client = new Client({ intents, partials });

client.once(Events.ClientReady, (c) => {
  console.log('[royal-bot-gateway] ready as', c.user.tag, '| DISCORD_GUILD_ID', GUILD_ID);
});

if (process.env.DISCORD_ENGAGEMENT_DISABLED === '1') {
  console.log('[royal-bot-gateway] DISCORD_ENGAGEMENT_DISABLED=1 — engagement listeners not attached');
} else {
  const attached = attachEngagementTracking(client, { skipIfDisabled: false });
  if (!attached) {
    console.error('[royal-bot-gateway] attachEngagementTracking failed');
    process.exit(1);
  }
}

/**
 * @param {import('discord.js').Client} c
 */
function registerRoyalBotGatewayHandlers(c) {
  // Add ROYAL BOT Gateway listeners here, e.g.:
  // const { Events: E } = require('discord.js');
  // c.on(E.MessageCreate, (msg) => { ... });
}

registerRoyalBotGatewayHandlers(client);

client.login(TOKEN).catch((e) => {
  console.error('[royal-bot-gateway] login failed', e.message);
  process.exit(1);
});
