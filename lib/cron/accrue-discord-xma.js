/**
 * Batch-credit XMA from uncredited discord_engagement_events.
 */
const { createClient } = require('@supabase/supabase-js');

function accrualConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const batchLimit = Math.max(1, parseInt(process.env.DISCORD_XMA_ACCRUAL_BATCH || '2000', 10) || 2000);
  const dailyCap = Number(process.env.DISCORD_XMA_DAILY_ACCRUAL_CAP || '100000');
  const perMessage = Number(process.env.DISCORD_XMA_PER_MESSAGE || '300');
  const perReaction = Number(process.env.DISCORD_XMA_PER_REACTION || '200');
  const perVoiceMinute = Number(process.env.DISCORD_XMA_PER_VOICE_MINUTE || '100');

  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  if (!Number.isFinite(dailyCap) || dailyCap <= 0) {
    throw new Error('DISCORD_XMA_DAILY_ACCRUAL_CAP must be a positive number');
  }
  if (!Number.isFinite(perMessage) || perMessage <= 0) {
    throw new Error('DISCORD_XMA_PER_MESSAGE must be a positive number');
  }
  if (!Number.isFinite(perReaction) || perReaction <= 0) {
    throw new Error('DISCORD_XMA_PER_REACTION must be a positive number');
  }
  if (!Number.isFinite(perVoiceMinute) || perVoiceMinute <= 0) {
    throw new Error('DISCORD_XMA_PER_VOICE_MINUTE must be a positive number');
  }

  return {
    supabase: createClient(url, key),
    batchLimit,
    dailyCap,
    perMessage,
    perReaction,
    perVoiceMinute,
  };
}

/**
 * @param {{ maxBatches?: number }} [options] — default Infinity (CLI); HTTP cron uses 1 per request.
 */
async function runAccrueDiscordXmaRewards(options = {}) {
  const maxBatches = options.maxBatches != null ? options.maxBatches : Infinity;
  const { supabase, batchLimit, dailyCap, perMessage, perReaction, perVoiceMinute } = accrualConfig();

  let totalMarked = 0;
  const batches = [];
  let batchCount = 0;

  for (;;) {
    const { data, error } = await supabase.rpc('process_discord_engagement_accrual_batch', {
      p_batch_limit: batchLimit,
      p_daily_cap: dailyCap,
      p_xma_message: perMessage,
      p_xma_reaction: perReaction,
      p_xma_voice_minute: perVoiceMinute,
    });
    if (error) {
      const msg = error.message || String(error);
      const err = new Error('RPC process_discord_engagement_accrual_batch failed: ' + msg);
      err.details = error;
      throw err;
    }

    let marked = 0;
    if (data && data.events_marked != null) {
      const m = Number(data.events_marked);
      marked = Number.isFinite(m) ? m : 0;
    }
    totalMarked += marked;
    batches.push(data);
    batchCount += 1;

    if (!marked || batchCount >= maxBatches) break;
  }

  return { totalMarked, batchCount, batches };
}

module.exports = { runAccrueDiscordXmaRewards };
