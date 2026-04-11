/**
 * @deprecated Prefer `npm run royal-bot-gateway` — same Gateway process, clearer name for ROYAL BOT.
 *
 * Kept for existing deploy scripts. When DISCORD_ENGAGEMENT_DISABLED=1, exits without connecting
 * (legacy “standalone engagement worker off” behavior).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

if (process.env.DISCORD_ENGAGEMENT_DISABLED === '1') {
  console.log('[engagement] DISCORD_ENGAGEMENT_DISABLED=1 — exiting (use royal-bot-gateway when merged)');
  process.exit(0);
}

require('./royal-bot-gateway.js');
