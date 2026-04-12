/**
 * Move yesterday’s (America/New_York) pending engagement XMA into unclaimed_xma and clear daily ledgers.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, DISCORD_GUILD_ID
 * Optional: DAILY_GRANT_TIMEZONE (default America/New_York), SETTLE_DATE=YYYY-MM-DD (override)
 *
 * Run once or twice daily after midnight ET (e.g. GitHub Actions). Safe to re-run (idempotent for empty date).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { yesterdayCalendarDateInTimeZone } = require('../lib/discord/daily-grant-schedule');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const guildId = (process.env.DISCORD_GUILD_ID || '').trim();
const tz = (process.env.DAILY_GRANT_TIMEZONE || 'America/New_York').trim();
const settleDateOverride = (process.env.SETTLE_DATE || '').trim();

if (!url || !key || !guildId) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or DISCORD_GUILD_ID');
  process.exit(1);
}

const settleDate = settleDateOverride || yesterdayCalendarDateInTimeZone(tz || 'America/New_York');
if (!/^\d{4}-\d{2}-\d{2}$/.test(settleDate)) {
  console.error('Invalid settle date:', settleDate);
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.rpc('settle_discord_xma_daily_pending', {
    p_guild_id: guildId,
    p_accrual_date: settleDate,
  });

  if (error) {
    console.error('RPC settle_discord_xma_daily_pending failed:', error.message || error);
    process.exit(1);
  }

  console.log(JSON.stringify(data));
  if (data && data.error) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
