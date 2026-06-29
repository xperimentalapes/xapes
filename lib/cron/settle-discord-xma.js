/**
 * Move yesterday's (America/New_York) pending engagement XMA into unclaimed_xma.
 */
const { createClient } = require('@supabase/supabase-js');
const { yesterdayCalendarDateInTimeZone } = require('../discord/daily-grant-schedule');

/**
 * @param {{ settleDate?: string, timezone?: string, guildId?: string }} [options]
 */
async function runSettleDiscordXmaDaily(options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const guildId = (options.guildId || process.env.DISCORD_GUILD_ID || '').trim();
  const tz = (options.timezone || process.env.DAILY_GRANT_TIMEZONE || 'America/New_York').trim();
  const settleDateOverride = (options.settleDate || process.env.SETTLE_DATE || '').trim();

  if (!url || !key || !guildId) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or DISCORD_GUILD_ID');
  }

  const settleDate = settleDateOverride || yesterdayCalendarDateInTimeZone(tz || 'America/New_York');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settleDate)) {
    throw new Error('Invalid settle date: ' + settleDate);
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase.rpc('settle_discord_xma_daily_pending', {
    p_guild_id: guildId,
    p_accrual_date: settleDate,
  });

  if (error) {
    throw new Error('RPC settle_discord_xma_daily_pending failed: ' + (error.message || String(error)));
  }
  if (data && data.error) {
    throw new Error(String(data.error));
  }

  return { settleDate, guildId, timezone: tz, result: data };
}

module.exports = { runSettleDiscordXmaDaily };
