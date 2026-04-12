/**
 * Batch-credit XMA from uncredited discord_engagement_events (messages, reactions, voice).
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Env (defaults match product rates):
 *   DISCORD_XMA_ACCRUAL_BATCH (default 2000)
 *   DISCORD_XMA_DAILY_ACCRUAL_CAP (default 100000) — per user per America/New_York calendar day
 *   DISCORD_XMA_PER_MESSAGE (default 300)
 *   DISCORD_XMA_PER_REACTION (default 200)
 *   DISCORD_XMA_PER_VOICE_MINUTE (default 100)
 *
 * Credits go into discord_xma_daily_pending until settle_discord_xma_daily_pending runs (see settle-discord-xma-daily.js).
 * Run on a schedule (e.g. GitHub Actions) until a batch marks zero events.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const batchLimit = Math.max(1, parseInt(process.env.DISCORD_XMA_ACCRUAL_BATCH || '2000', 10) || 2000);
const dailyCap = Number(process.env.DISCORD_XMA_DAILY_ACCRUAL_CAP || '100000');
const perMessage = Number(process.env.DISCORD_XMA_PER_MESSAGE || '300');
const perReaction = Number(process.env.DISCORD_XMA_PER_REACTION || '200');
const perVoiceMinute = Number(process.env.DISCORD_XMA_PER_VOICE_MINUTE || '100');

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  process.exit(1);
}
if (!Number.isFinite(dailyCap) || dailyCap <= 0) {
  console.error('DISCORD_XMA_DAILY_ACCRUAL_CAP must be a positive number');
  process.exit(1);
}
if (!Number.isFinite(perMessage) || perMessage <= 0) {
  console.error('DISCORD_XMA_PER_MESSAGE must be a positive number');
  process.exit(1);
}
if (!Number.isFinite(perReaction) || perReaction <= 0) {
  console.error('DISCORD_XMA_PER_REACTION must be a positive number');
  process.exit(1);
}
if (!Number.isFinite(perVoiceMinute) || perVoiceMinute <= 0) {
  console.error('DISCORD_XMA_PER_VOICE_MINUTE must be a positive number');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  let totalMarked = 0;
  for (;;) {
    const { data, error } = await supabase.rpc('process_discord_engagement_accrual_batch', {
      p_batch_limit: batchLimit,
      p_daily_cap: dailyCap,
      p_xma_message: perMessage,
      p_xma_reaction: perReaction,
      p_xma_voice_minute: perVoiceMinute,
    });
    if (error) {
      console.error('RPC process_discord_engagement_accrual_batch failed:', error.message || error);
      if (error.details) console.error('details:', error.details);
      if (error.hint) console.error('hint:', error.hint);
      if (error.code) console.error('code:', error.code);
      process.exit(1);
    }
    let marked = 0;
    if (data && data.events_marked != null) {
      const m = Number(data.events_marked);
      marked = Number.isFinite(m) ? m : 0;
    }
    totalMarked += marked;
    console.log(JSON.stringify(data));
    if (!marked) break;
  }
  console.log('accrual complete; total events marked:', totalMarked);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
