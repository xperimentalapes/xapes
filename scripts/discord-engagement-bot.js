/**
 * Standalone engagement Gateway worker (discord.js).
 *
 * **If your main bot already uses discord.js with the same DISCORD_BOT_TOKEN**, do NOT run
 * this script in parallel — Discord allows only one Gateway session per token. Instead,
 * `require('../lib/discord/engagement-gateway')` and call `attachEngagementTracking(client)`
 * on your existing Client (merge ENGAGEMENT_INTENT_BITS into `intents`).
 *
 * Prereqs: migration_discord_engagement.sql, Bot intents (incl. Message Content + Guild Members),
 * env DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY.
 *
 * Optional: DISCORD_ENGAGEMENT_DISABLED=1 — exit without connecting (useful in monorepo).
 *           DISCORD_ENGAGEMENT_CHANNEL_IDS / DISCORD_ENGAGEMENT_IGNORE_CHANNEL_IDS
 *
 * Run: npm run discord-engagement-bot
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client, Partials, Events } = require('discord.js');
const {
  attachEngagementTracking,
  ENGAGEMENT_INTENT_BITS,
  ENGAGEMENT_PARTIALS,
} = require('../lib/discord/engagement-gateway');

if (process.env.DISCORD_ENGAGEMENT_DISABLED === '1') {
  console.log('[engagement] DISCORD_ENGAGEMENT_DISABLED=1 — exiting (use main bot attach instead)');
  process.exit(0);
}

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!TOKEN || !GUILD_ID || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY'
  );
  process.exit(1);
}

const client = new Client({
  intents: ENGAGEMENT_INTENT_BITS,
  partials: ENGAGEMENT_PARTIALS,
});

client.once(Events.ClientReady, (c) => {
  console.log('[engagement] logged in as', c.user.tag, 'guild', GUILD_ID);
});

const attached = attachEngagementTracking(client, { skipIfDisabled: false });
if (!attached) {
  console.error('[engagement] failed to attach listeners');
  process.exit(1);
}

client.login(TOKEN).catch((e) => {
  console.error('[engagement] login failed', e.message);
  process.exit(1);
});
