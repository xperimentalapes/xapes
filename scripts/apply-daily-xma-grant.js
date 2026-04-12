/**
 * Daily flat XMA grant for all engaged / wallet-linked Discord users (per guild).
 * Idempotent per calendar day (America/New_York) via Supabase RPC.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, DISCORD_GUILD_ID
 * Required: DAILY_XMA_GRANT_AMOUNT (no default — flat grant is opt-in only)
 * Optional: DAILY_GRANT_TIMEZONE (default America/New_York)
 * Optional: GRANT_DATE=YYYY-MM-DD for backfill / testing (must match intended NY calendar day)
 *
 * Optional automation: set DAILY_XMA_GRANT_AMOUNT explicitly if you use a flat grant job.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { calendarDateInTimeZone } = require('../lib/discord/daily-grant-schedule');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const guildId = (process.env.DISCORD_GUILD_ID || '').trim();
const amountRaw = (process.env.DAILY_XMA_GRANT_AMOUNT || '').trim();
const amount = Number(amountRaw);
const tz = process.env.DAILY_GRANT_TIMEZONE || 'America/New_York';
const grantDateOverride = (process.env.GRANT_DATE || '').trim();

if (!url || !key || !guildId) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or DISCORD_GUILD_ID');
  process.exit(1);
}
if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
  console.error('DAILY_XMA_GRANT_AMOUNT must be set to a positive number (no default)');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const grantDate = grantDateOverride || calendarDateInTimeZone(tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(grantDate)) {
    console.error('Invalid GRANT_DATE or calendar date:', grantDate);
    process.exit(1);
  }

  const { data, error } = await supabase.rpc('apply_discord_daily_xma_grant', {
    p_guild_id: guildId,
    p_amount: amount,
    p_grant_date: grantDate,
  });

  if (error) {
    console.error('RPC apply_discord_daily_xma_grant failed:', error.message || error);
    process.exit(1);
  }

  console.log(JSON.stringify(data));
  if (data && data.skipped) {
    process.exit(0);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
