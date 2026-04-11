/**
 * Batch-credit XMA from uncredited discord_engagement_events (message rows).
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Optional: DISCORD_XMA_ACCRUAL_BATCH (default 5000), DISCORD_XMA_PER_MESSAGE (default 600)
 *
 * Run on a schedule (e.g. GitHub Actions cron) until process exits with 0.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const batchLimit = Math.max(1, parseInt(process.env.DISCORD_XMA_ACCRUAL_BATCH || '5000', 10) || 5000);
const perMessage = Number(process.env.DISCORD_XMA_PER_MESSAGE || '600');

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  process.exit(1);
}
if (!Number.isFinite(perMessage) || perMessage <= 0) {
  console.error('DISCORD_XMA_PER_MESSAGE must be a positive number');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  let totalMarked = 0;
  for (;;) {
    const { data, error } = await supabase.rpc('process_discord_message_event_accrual', {
      p_batch_limit: batchLimit,
      p_xma_per_message: perMessage,
    });
    if (error) {
      console.error('RPC process_discord_message_event_accrual failed:', error.message || error);
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
